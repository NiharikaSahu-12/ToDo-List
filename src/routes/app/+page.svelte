<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { invalidateAll } from '$app/navigation';
  import { navigating } from '$app/state';
  import { onMount } from 'svelte';
  import { dndzone, SHADOW_PLACEHOLDER_ITEM_ID, type DndEvent } from 'svelte-dnd-action';
  import { getSupabaseBrowserClient } from '$lib/supabase/client';
  import type { Task } from '$lib/types/task';
  import { taskStatusSchema, type TaskStatus } from '$lib/schemas/tasks';
  import {
    BellRing, CalendarDays, Check, ChevronDown, Circle, Clock3, Columns3, FileText, List, ListTodo, LogOut,
    MessageCircle, Moon, Plus, Search, Send, Sparkles, Sun, Tag, Trash2, X
  } from '@lucide/svelte';
  import TaskSkeleton from '$lib/components/TaskSkeleton.svelte';
  import { createThemeStore } from '$lib/stores/theme.svelte';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData | undefined } = $props();
  const statuses: TaskStatus[] = ['todo', 'in-progress', 'done'];
  const statusLabels: Record<TaskStatus, string> = { todo: 'To do', 'in-progress': 'In progress', done: 'Done' };
  let lanes = $state<Record<TaskStatus, Task[]>>({ todo: [], 'in-progress': [], done: [] });
  let search = $state('');
  let priorityFilter = $state('all');
  let tagFilter = $state('all');
  let dueFilter = $state('all');
  let sortBy = $state('manual');
  let summaryRange = $state<'day' | 'week'>('day');
  let view = $state<'board' | 'list'>('board');
  let aiInput = $state('');
  let aiBusy = $state(false);
  let aiError = $state('');
  let toast = $state('');
  let chatOpen = $state(false);
  let chatBusy = $state(false);
  let chatInput = $state('');
  let chatMessages = $state<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  let aiInsight = $state<
    | { type: 'prioritize'; reasoning: string; tasks: Task[] }
    | { type: 'summary'; summary: string; completed: string[]; overdue: string[]; focus: string[] }
    | null
  >(null);
  const theme = createThemeStore();
  const reminderTimers = new Map<string, { timer: number; at: string }>();
  let clientReady = $state(false);

  const sortTasks = (tasks: Task[]) => {
    if (sortBy === 'priority') {
      const rank = { high: 0, med: 1, low: 2 };
      return [...tasks].sort((left, right) => rank[left.priority] - rank[right.priority]);
    }
    if (sortBy === 'due') {
      return [...tasks].sort((left, right) => {
        if (!left.due_at) return 1;
        if (!right.due_at) return -1;
        return new Date(left.due_at).getTime() - new Date(right.due_at).getTime();
      });
    }
    return tasks;
  };
  let aiEstimate = $state<Record<string, { tags: string[]; estimatedMinutes: number }>>({});
  let dragDisabled = $derived(search.trim().length > 0 || priorityFilter !== 'all' || tagFilter !== 'all' || dueFilter !== 'all' || sortBy !== 'manual');

  $effect(() => {
    const tasks = (data.tasks ?? []) as unknown as Task[];
    lanes = {
      todo: tasks.filter((task) => task.status === 'todo'),
      'in-progress': tasks.filter((task) => task.status === 'in-progress'),
      done: tasks.filter((task) => task.status === 'done')
    };
  });

  const matchesFilters = (task: Task) => {
    const query = search.trim().toLocaleLowerCase();
    const taskTags = task.task_tags?.flatMap((link) => link.tags ? [link.tags] : []) ?? [];
    const due = task.due_at ? new Date(task.due_at) : null;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(todayStart.getDate() + 1);
    const nextWeek = new Date(todayStart);
    nextWeek.setDate(todayStart.getDate() + 7);
    const dateMatches = dueFilter === 'all'
      || (dueFilter === 'overdue' && task.status !== 'done' && due !== null && due.getTime() < Date.now())
      || (dueFilter === 'today' && due !== null && due >= todayStart && due < tomorrowStart)
      || (dueFilter === 'week' && due !== null && due >= todayStart && due < nextWeek)
      || (dueFilter === 'no-date' && due === null);
    return (!query || `${task.title} ${task.description}`.toLocaleLowerCase().includes(query))
      && (priorityFilter === 'all' || task.priority === priorityFilter)
      && (tagFilter === 'all' || taskTags.some((tag) => tag.id === tagFilter))
      && dateMatches;
  };

  let filteredLanes = $derived.by(() => ({
    todo: sortTasks(lanes.todo.filter(matchesFilters)),
    'in-progress': sortTasks(lanes['in-progress'].filter(matchesFilters)),
    done: sortTasks(lanes.done.filter(matchesFilters))
  }));

  let remainingCount = $derived((data.tasks as unknown as Task[]).filter((task) => task.status !== 'done').length);
  const snapshotLanes = () => ({
    todo: [...lanes.todo],
    'in-progress': [...lanes['in-progress']],
    done: [...lanes.done]
  });

  const optimisticCreate: SubmitFunction = ({ formData }) => {
    const title = String(formData.get('title') ?? '').trim();
    const projectId = String(formData.get('projectId') ?? '');
    if (!title || !data.user?.id || !projectId) return;
    const previous = snapshotLanes();
    const dueValue = String(formData.get('dueAt') ?? '');
    const reminderValue = String(formData.get('reminderAt') ?? '');
    const now = new Date().toISOString();
    const optimisticTask: Task = {
      id: `optimistic-${crypto.randomUUID()}`,
      user_id: data.user.id,
      project_id: projectId,
      title,
      description: String(formData.get('description') ?? ''),
      priority: String(formData.get('priority') ?? 'med') as Task['priority'],
      status: 'todo',
      due_at: dueValue ? new Date(dueValue).toISOString() : null,
      reminder_at: reminderValue ? new Date(reminderValue).toISOString() : null,
      position: lanes.todo.length + 1,
      recurrence_rule: null,
      estimated_minutes: null,
      completed_at: null,
      created_at: now,
      updated_at: now,
      subtasks: [],
      task_tags: []
    };
    lanes.todo = [...lanes.todo, optimisticTask];
    return async ({ result, update }) => {
      if (result.type === 'failure' || result.type === 'error') {
        lanes = previous;
        toast = 'Task was not saved. Please try again.';
      }
      await update();
    };
  };

  const optimisticStatus = (task: Task): SubmitFunction => ({ formData }) => {
    const nextStatus = taskStatusSchema.safeParse(formData.get('status'));
    if (!nextStatus.success) return;
    const previous = snapshotLanes();
    const movingTask = statuses.flatMap((status) => lanes[status]).find((entry) => entry.id === task.id) ?? task;
    for (const status of statuses) lanes[status] = lanes[status].filter((entry) => entry.id !== task.id);
    lanes[nextStatus.data] = [...lanes[nextStatus.data], { ...movingTask, status: nextStatus.data }];
    return async ({ result, update }) => {
      if (result.type === 'failure' || result.type === 'error') {
        lanes = previous;
        toast = 'Task status was not saved. Please try again.';
      }
      await update();
    };
  };

  const optimisticDelete = (task: Task): SubmitFunction => () => {
    const previous = snapshotLanes();
    for (const status of statuses) lanes[status] = lanes[status].filter((entry) => entry.id !== task.id);
    return async ({ result, update }) => {
      if (result.type === 'failure' || result.type === 'error') {
        lanes = previous;
        toast = 'Task could not be deleted. Please try again.';
      }
      await update();
    };
  };

  const onConsider = (status: TaskStatus, event: CustomEvent<DndEvent<Task>>) => {
    lanes[status] = event.detail.items;
  };

  const onFinalize = async (status: TaskStatus, event: CustomEvent<DndEvent<Task>>) => {
    lanes[status] = event.detail.items.filter((task) => task.id !== SHADOW_PLACEHOLDER_ITEM_ID);
    const persisted = statuses.flatMap((laneStatus) =>
      lanes[laneStatus]
        .filter((task) => task.id !== SHADOW_PLACEHOLDER_ITEM_ID)
        .map((task, index) => ({ id: task.id, status: laneStatus, position: index + 1 }))
    );

    try {
      const response = await fetch('/api/tasks/reorder', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tasks: persisted })
      });
      if (!response.ok) throw new Error('Task positions could not be saved.');
      await invalidateAll();
    } catch (error) {
      console.error('Task drag-and-drop save failed', error);
      toast = error instanceof Error ? error.message : 'Task positions could not be saved.';
      const tasks = (data.tasks ?? []) as unknown as Task[];
      lanes = {
        todo: tasks.filter((task) => task.status === 'todo'),
        'in-progress': tasks.filter((task) => task.status === 'in-progress'),
        done: tasks.filter((task) => task.status === 'done')
      };
    }
  };

  const handleQuickAdd = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!aiInput.trim() || aiBusy) return;
    aiBusy = true;
    aiError = '';
    try {
      const response = await fetch('/api/ai/quick-add', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: aiInput, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'AI could not interpret that task.');
      const formElement = event.currentTarget as HTMLFormElement;
      formElement.querySelector<HTMLInputElement>('[name="title"]')!.value = result.title;
      formElement.querySelector<HTMLTextAreaElement>('[name="description"]')!.value = result.description ?? '';
      formElement.querySelector<HTMLSelectElement>('[name="priority"]')!.value = result.priority;
      formElement.querySelector<HTMLInputElement>('[name="tags"]')!.value = (result.tags ?? []).join(', ');
      if (result.dueAt) {
        const due = new Date(result.dueAt);
        formElement.querySelector<HTMLInputElement>('[name="dueAt"]')!.value =
          new Date(due.getTime() - due.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
      }
      aiInput = '';
      toast = 'AI drafted the task. Review the details and add it when ready.';
    } catch (error) {
      aiError = error instanceof Error ? error.message : 'AI could not interpret that task.';
    } finally {
      aiBusy = false;
    }
  };

  const generateBreakdown = async (task: Task) => {
    try {
      const response = await fetch('/api/ai/breakdown', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: task.title, description: task.description })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Could not generate subtasks.');
      const saveResponse = await fetch('/api/tasks/subtasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, titles: result.subtasks })
      });
      if (!saveResponse.ok) {
        const error = await saveResponse.json();
        throw new Error(error.error ?? 'Could not save the generated subtasks.');
      }
      await invalidateAll();
      toast = 'AI subtasks added.';
    } catch (error) {
      toast = error instanceof Error ? error.message : 'Could not generate subtasks.';
    }
  };

  const sendChatMessage = async (event: SubmitEvent) => {
    event.preventDefault();
    const message = chatInput.trim();
    if (!message || chatBusy || !data.activeProject) return;
    chatInput = '';
    chatMessages.push({ role: 'user', content: message });
    chatMessages.push({ role: 'assistant', content: '' });
    chatBusy = true;

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: data.activeProject.id,
          message,
          history: chatMessages.slice(0, -2).slice(-20)
        })
      });
      if (!response.ok || !response.body) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error ?? 'The assistant could not respond.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const blocks = pending.split('\n\n');
        pending = blocks.pop() ?? '';
        for (const block of blocks) {
          const line = block.split('\n').find((entry) => entry.startsWith('data: '));
          if (!line) continue;
          const payload = JSON.parse(line.slice(6)) as { text?: string; error?: string };
          if (payload.error) throw new Error(payload.error);
          if (payload.text) {
            const last = chatMessages.length - 1;
            chatMessages[last] = { ...chatMessages[last], content: chatMessages[last].content + payload.text };
          }
        }
      }
      await invalidateAll();
    } catch (error) {
      const last = chatMessages.length - 1;
      chatMessages[last] = {
        ...chatMessages[last],
        content: error instanceof Error ? error.message : 'The assistant could not respond.'
      };
    } finally {
      chatBusy = false;
    }
  };

  const estimateTasks = async () => {
    try {
      const tasks = (data.tasks as unknown as Task[]).filter((task) => task.status !== 'done');
      const suggestions: Array<{ id: string; tags: string[]; estimatedMinutes: number }> = [];
      for (let index = 0; index < tasks.length; index += 30) {
        const batch = tasks.slice(index, index + 30);
        const response = await fetch('/api/ai/auto-tag', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tasks: batch.map(({ id, title, description }) => ({ id, title, description })) })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? 'AI task analysis failed.');
        suggestions.push(...result.tasks);
      }
      aiEstimate = Object.fromEntries(suggestions.map((task) => [task.id, { tags: task.tags, estimatedMinutes: task.estimatedMinutes }]));
      toast = `AI suggested tags and time estimates for ${suggestions.length} tasks.`;
    } catch (error) {
      toast = error instanceof Error ? error.message : 'AI task analysis failed.';
    }
  };

  const runAiInsight = async (type: 'prioritize' | 'summary') => {
    try {
      const tasks = data.tasks as unknown as Task[];
      const activeTasks = tasks.filter((task) => task.status !== 'done');
      if (type === 'prioritize' && activeTasks.length > 100) {
        throw new Error('Task prioritization supports up to 100 open tasks at a time.');
      }
      const rangeStart = new Date();
      if (summaryRange === 'day') rangeStart.setHours(0, 0, 0, 0);
      else rangeStart.setDate(rangeStart.getDate() - 7);
      const summaryTasks = tasks.filter((task) =>
        task.status !== 'done' || (task.completed_at && new Date(task.completed_at) >= rangeStart)
      ).slice(0, 500);
      const response = await fetch(`/api/ai/${type}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(type === 'prioritize'
          ? { tasks: activeTasks.map(({ id, title, priority, due_at, status }) => ({ id, title, priority, dueAt: due_at, status })) }
          : { range: summaryRange, tasks: summaryTasks.map(({ title, status, due_at, created_at, completed_at }) => ({ title, status, dueAt: due_at, createdAt: created_at, completedAt: completed_at })) })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'The AI request failed.');
      if (type === 'prioritize') {
        const byId = new Map(activeTasks.map((task) => [task.id, task]));
        const ids = result.orderedTaskIds as string[];
        const idSet = new Set(ids);
        if (idSet.size !== activeTasks.length || activeTasks.some((task) => !idSet.has(task.id))) {
          throw new Error('AI returned an incomplete task ordering.');
        }
        const orderedTasks = ids.map((id) => byId.get(id)).filter((task): task is Task => Boolean(task));
        if (orderedTasks.length !== activeTasks.length) throw new Error('AI returned an incomplete task ordering.');
        aiInsight = { type, reasoning: result.reasoning, tasks: orderedTasks };
      } else {
        aiInsight = { type, summary: result.summary, completed: result.completed, overdue: result.overdue, focus: result.focus };
      }
    } catch (error) {
      toast = error instanceof Error ? error.message : 'The AI request failed.';
    }
  };

  const formatDateTime = (value: string | null) => {
    if (!value) return '';
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
  };

  const localDateTime = (value: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  };

  const isOverdue = (task: Task) => task.status !== 'done' && task.due_at !== null && new Date(task.due_at).getTime() < Date.now();
  const taskTagNames = (task: Task) => (task.task_tags ?? []).flatMap((link) => link.tags ? [link.tags.name] : []);

  const scheduleReminders = (tasks: Task[]) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    for (const [taskId, scheduled] of reminderTimers) {
      const task = tasks.find((entry) => entry.id === taskId);
      if (!task || task.reminder_at !== scheduled.at) {
        window.clearTimeout(scheduled.timer);
        reminderTimers.delete(taskId);
      }
    }
    for (const task of tasks) {
      if (!task.reminder_at || reminderTimers.has(task.id)) continue;
      const due = new Date(task.reminder_at).getTime();
      const lastReminder = localStorage.getItem(`daymark-reminder-${task.id}`);
      if (lastReminder && Date.parse(lastReminder) >= due) continue;
      const delay = due - Date.now();
      if (delay <= 0) continue;
      const timer = window.setTimeout(() => {
        reminderTimers.delete(task.id);
        if (Date.now() < due) {
          scheduleReminders((data.tasks ?? []) as unknown as Task[]);
          return;
        }
        if (Notification.permission === 'granted') {
          const currentTask = (data.tasks as unknown as Task[]).find((entry) => entry.id === task.id);
          if (!currentTask) return;
          new Notification('Daymark reminder', { body: currentTask.title, tag: task.id });
          localStorage.setItem(`daymark-reminder-${task.id}`, new Date().toISOString());
        }
      }, Math.min(delay, 2_147_000_000));
      reminderTimers.set(task.id, { timer, at: task.reminder_at });
    }
  };

  const enableReminders = async () => {
    if (!('Notification' in window)) {
      toast = 'This browser does not support desktop reminders.';
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      scheduleReminders((data.tasks ?? []) as unknown as Task[]);
      toast = 'Browser reminders enabled while Daymark is open.';
    } else {
      toast = 'Reminder permission was not granted.';
    }
  };

  const handleKeyboardShortcut = (event: KeyboardEvent) => {
    const target = event.target;
    const editing = target instanceof HTMLElement && (target.matches('input,textarea,select,[contenteditable="true"]') || target.isContentEditable);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !editing) {
      event.preventDefault();
      document.querySelector<HTMLInputElement>('.search-box input')?.focus();
    }
    if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'n' && !editing) {
      document.querySelector<HTMLInputElement>('.task-form [name="title"]')?.focus();
    }
  };

  onMount(() => {
    const savedTheme = localStorage.getItem('daymark-theme');
    theme.set(savedTheme === 'dark' ? 'dark' : 'light');
    clientReady = true;
    scheduleReminders((data.tasks ?? []) as unknown as Task[]);
    if (!data.user?.id) return;
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`task-sync-${data.user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${data.user.id}` }, () => {
        void invalidateAll();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subtasks', filter: `user_id=eq.${data.user.id}` }, () => {
        void invalidateAll();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
      for (const scheduled of reminderTimers.values()) window.clearTimeout(scheduled.timer);
      reminderTimers.clear();
    };
  });

  $effect(() => {
    const tasks = data.tasks as unknown as Task[];
    if (clientReady && typeof window !== 'undefined') scheduleReminders(tasks);
  });
</script>

<svelte:head>
  <title>{data.activeProject?.name ?? 'My tasks'} · Daymark</title>
  <meta name="description" content="Plan, prioritize, and complete your tasks." />
</svelte:head>

<svelte:window onkeydown={handleKeyboardShortcut} />

{#if navigating.to}
  <TaskSkeleton />
{:else}
<div class="workspace">
  <aside class="sidebar">
    <a class="brand" href="/app"><span class="brand-icon"><ListTodo size={20} /></span> daymark</a>
    <div class="sidebar-label">WORKSPACE</div>
    <nav aria-label="Projects">
      {#each data.projects as project}
        <a class:active={project.id === data.activeProject?.id} href={`/app?project=${project.id}`}>
          <span class="project-dot" style={`--project-color:${project.color ?? '#8c80f5'}`}></span>{project.name}
        </a>
      {/each}
      <details class="project-create">
        <summary class="add-project"><Plus size={15} /> New project</summary>
        <form method="POST" action="?/createProject" use:enhance>
          <input name="name" maxlength="100" required placeholder="Project name" aria-label="Project name" />
          <button type="submit">Create</button>
        </form>
      </details>
    </nav>
    <div class="sidebar-bottom">
      <div class="ai-card"><Sparkles size={16} /><strong>Plan with a little help.</strong><span>AI tools, right where you work.</span></div>
      <form method="POST" action="/auth/logout" use:enhance>
        <button class="signout" type="submit"><LogOut size={16} /> Sign out</button>
      </form>
    </div>
  </aside>

  <main class="main">
    <header class="topbar">
      <span>{data.user?.email}</span>
      <button class="theme-toggle" onclick={() => theme.toggle()} aria-label={theme.mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
        {#if theme.mode === 'dark'}<Sun size={16} />{:else}<Moon size={16} />{/if}
      </button>
      <span class="user-avatar">{data.user?.email?.slice(0, 1).toUpperCase() ?? 'U'}</span>
    </header>
    <section class="page-content">
      <div class="page-heading">
        <div><p class="eyebrow">YOUR WORKSPACE</p><h1>{data.activeProject?.name ?? 'My tasks'}</h1><p class="subheading">{remainingCount} task{remainingCount === 1 ? '' : 's'} left · a little progress goes a long way.</p></div>
        <div class="date-label">{new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}</div>
      </div>

      {#if form && 'message' in form && form.message}
        <p class="inline-message" role="alert">{form.message}</p>
      {/if}

      {#if data.activeProject}
        <section class="composer">
          <form class="ai-quick-form" onsubmit={handleQuickAdd}>
            <Sparkles size={17} />
            <input bind:value={aiInput} aria-label="Describe a task for AI" placeholder='Quick add with AI: "Submit report Friday 5pm, high priority"' />
            <button type="submit" disabled={aiBusy || !aiInput.trim()}>{aiBusy ? 'Thinking…' : 'Draft with AI'}</button>
          </form>
          {#if aiError}<p class="inline-message error" role="alert">{aiError}</p>{/if}
          <form method="POST" action="?/createTask" use:enhance={optimisticCreate} class="task-form">
            <input type="hidden" name="projectId" value={data.activeProject.id} />
            <div class="task-form-main">
              <input name="title" required maxlength="240" placeholder="Add a task to this project…" aria-label="Task title" />
              <textarea name="description" rows="1" maxlength="5000" placeholder="Add details (optional)" aria-label="Task description"></textarea>
            </div>
            <div class="task-form-options">
              <label><span class="sr-only">Priority</span><select name="priority" aria-label="Priority"><option value="low">Low priority</option><option value="med" selected>Medium priority</option><option value="high">High priority</option></select></label>
              <label class="date-input"><CalendarDays size={14} /><input name="dueAt" type="datetime-local" aria-label="Due date" /></label>
              <label class="date-input"><Clock3 size={14} /><input name="reminderAt" type="datetime-local" aria-label="Reminder date and time" title="Reminder date and time" /></label>
              <label><span class="sr-only">Repeat task</span><select name="recurrence" aria-label="Repeat task"><option value="none">No repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
              <input class="tags-input" name="tags" maxlength="360" placeholder="Tags, comma separated" aria-label="Tags, comma separated" />
              <button class="add-task-button" type="submit"><Plus size={16} /> Add task</button>
            </div>
          </form>
        </section>

        <div class="toolbar">
          <div class="search-box"><Search size={16} /><input bind:value={search} placeholder="Search tasks…" aria-label="Search tasks" /></div>
          <label class="filter-select"><span class="sr-only">Filter by priority</span><select bind:value={priorityFilter}><option value="all">All priorities</option><option value="high">High priority</option><option value="med">Medium priority</option><option value="low">Low priority</option></select><ChevronDown size={14} /></label>
          {#if data.tags.length > 0}
            <label class="filter-select"><Tag size={14} /><span class="sr-only">Filter by tag</span><select bind:value={tagFilter}><option value="all">All tags</option>{#each data.tags as tag}<option value={tag.id}>{tag.name}</option>{/each}</select><ChevronDown size={14} /></label>
          {/if}
          <label class="filter-select"><CalendarDays size={14} /><span class="sr-only">Filter by due date</span><select bind:value={dueFilter}><option value="all">Any due date</option><option value="overdue">Overdue</option><option value="today">Due today</option><option value="week">Next 7 days</option><option value="no-date">No due date</option></select><ChevronDown size={14} /></label>
          <label class="filter-select"><span class="sr-only">Sort tasks</span><select bind:value={sortBy}><option value="manual">Manual order</option><option value="due">Due date</option><option value="priority">Priority</option></select><ChevronDown size={14} /></label>
          <div class="view-toggle" aria-label="Task view">
            <button class:active={view === 'board'} onclick={() => (view = 'board')} aria-label="Board view"><Columns3 size={16} /></button>
            <button class:active={view === 'list'} onclick={() => (view = 'list')} aria-label="List view"><List size={16} /></button>
          </div>
          <button class="ai-tool-button" onclick={estimateTasks} title="Ask AI for suggested task tags"><Sparkles size={15} /><span>AI tag ideas</span></button>
          <button class="ai-tool-button" onclick={() => runAiInsight('prioritize')} title="Suggest today's task order"><Sparkles size={15} /><span>Plan today</span></button>
          <button class="ai-tool-button" onclick={() => runAiInsight('summary')} title="Generate a daily task summary"><FileText size={15} /><span>Daily summary</span></button>
          <select class="summary-range" bind:value={summaryRange} aria-label="AI summary range"><option value="day">Daily</option><option value="week">Weekly</option></select>
          <button class="ai-tool-button" onclick={enableReminders} title="Enable browser reminders"><BellRing size={15} /><span>Enable reminders</span></button>
        </div>

        {#if aiInsight}
          <section class="insight-panel">
            <header><div><Sparkles size={15} /><strong>{aiInsight.type === 'prioritize' ? 'Suggested focus order' : 'Your daily summary'}</strong></div><button onclick={() => (aiInsight = null)} aria-label="Dismiss AI insight"><X size={15} /></button></header>
            {#if aiInsight.type === 'prioritize'}
              <p>{aiInsight.reasoning}</p><ol>{#each aiInsight.tasks as task}<li><span>{task.title}</span><span class={`priority-pill ${task.priority}`}>{task.priority}</span></li>{/each}</ol>
            {:else}
              <p>{aiInsight.summary}</p>
              <div class="summary-columns"><div><strong>Completed</strong>{#each aiInsight.completed as item}<span>{item}</span>{:else}<span>Nothing yet</span>{/each}</div><div><strong>Overdue</strong>{#each aiInsight.overdue as item}<span>{item}</span>{:else}<span>None</span>{/each}</div><div><strong>Focus</strong>{#each aiInsight.focus as item}<span>{item}</span>{:else}<span>No suggestions</span>{/each}</div></div>
            {/if}
          </section>
        {/if}

        {#if view === 'board'}
          <section class="board" aria-label="Kanban task board">
            {#each statuses as status}
              <div class="column">
                <div class="column-heading"><span class={`status-dot ${status}`}></span><h2>{statusLabels[status]}</h2><span class="count">{filteredLanes[status].length}</span></div>
                <div class="task-zone" aria-label={`${statusLabels[status]} tasks`} use:dndzone={{ items: filteredLanes[status], type: 'tasks', flipDurationMs: 160, dragDisabled }} onconsider={(event) => onConsider(status, event)} onfinalize={(event) => onFinalize(status, event)}>
                  {#each filteredLanes[status] as task (task.id)}
                    <article class:overdue={isOverdue(task)} class="task-card">
                      <div class="card-topline"><span class={`priority-pill ${task.priority}`}>{task.priority === 'med' ? 'MEDIUM' : task.priority.toUpperCase()}</span>
                        <form method="POST" action="?/deleteTask" use:enhance={optimisticDelete(task)} onsubmit={(event) => { if (!confirm(`Delete "${task.title}"?`)) event.preventDefault(); }}>
                          <input type="hidden" name="taskId" value={task.id} /><button class="icon-button" type="submit" aria-label={`Delete ${task.title}`}><Trash2 size={15} /></button>
                        </form>
                      </div>
                      <h3>{task.title}</h3>
                      {#if task.description}<p class="task-description">{task.description}</p>{/if}
                      {#if task.due_at}<p class:overdue-text={isOverdue(task)} class="due-line"><Clock3 size={13} /> {isOverdue(task) ? 'Overdue · ' : ''}{formatDateTime(task.due_at)}</p>{/if}
                      {#if task.reminder_at}<p class="due-line"><CalendarDays size={13} /> Reminder · {formatDateTime(task.reminder_at)}</p>{/if}
                      {#if task.task_tags?.length}<div class="tag-row">{#each task.task_tags as link}{#if link.tags}<span class="task-tag" style={`--tag-color:${link.tags.color}`}>{link.tags.name}</span>{/if}{/each}</div>{/if}
                      {#if task.estimated_minutes}<p class="due-line"><Clock3 size={13} /> Estimated · {task.estimated_minutes} min</p>{/if}
                      {#if aiEstimate[task.id]}
                        <div class="suggested-tags"><span><Sparkles size={12} /> ~{aiEstimate[task.id].estimatedMinutes} min</span>{#each aiEstimate[task.id].tags as suggestedTag}<span class="suggested-tag">{suggestedTag}</span>{/each}</div>
                        <form method="POST" action="?/updateTask" use:enhance class="apply-suggestions-form">
                          <input type="hidden" name="taskId" value={task.id} /><input type="hidden" name="title" value={task.title} /><input type="hidden" name="description" value={task.description} />
                          <input type="hidden" name="priority" value={task.priority} /><input type="hidden" name="dueAt" value={localDateTime(task.due_at)} />
                          <input type="hidden" name="reminderAt" value={localDateTime(task.reminder_at)} /><input type="hidden" name="recurrence" value={(task.recurrence_rule?.frequency as string) ?? 'none'} />
                          <input type="hidden" name="tags" value={Array.from(new Set([...taskTagNames(task), ...aiEstimate[task.id].tags])).join(', ')} />
                          <input type="hidden" name="estimatedMinutes" value={aiEstimate[task.id].estimatedMinutes} />
                          <button type="submit">Apply suggestions</button>
                        </form>
                      {/if}
                      <details class="task-details">
                        <summary>Details <ChevronDown size={13} /></summary>
                        <form method="POST" action="?/updateTask" use:enhance class="edit-task-form">
                          <input type="hidden" name="taskId" value={task.id} />
                          <label>Title<input name="title" value={task.title} required maxlength="240" /></label>
                          <label>Description<textarea name="description" rows="3" maxlength="5000">{task.description}</textarea></label>
                          <div class="edit-row">
                            <label>Priority<select name="priority" value={task.priority}><option value="low">Low</option><option value="med">Medium</option><option value="high">High</option></select></label>
                            <label>Due date<input name="dueAt" type="datetime-local" value={localDateTime(task.due_at)} /></label>
                            <label>Reminder<input name="reminderAt" type="datetime-local" value={localDateTime(task.reminder_at)} /></label>
                            <label>Repeat<select name="recurrence" value={(task.recurrence_rule?.frequency as string) ?? 'none'}><option value="none">No repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
                            <label>Estimate (min)<input name="estimatedMinutes" type="number" min="1" max="10080" value={task.estimated_minutes ?? ''} /></label>
                          </div>
                          <label>Tags (comma separated)<input name="tags" value={taskTagNames(task).join(', ')} maxlength="360" /></label>
                          <button class="save-button" type="submit">Save changes</button>
                        </form>
                        <div class="subtasks">
                          <div class="subtask-heading"><strong>Subtasks</strong><button type="button" class="text-button" onclick={() => generateBreakdown(task)}><Sparkles size={13} /> Break down</button></div>
                          {#each task.subtasks ?? [] as subtask (subtask.id)}
                            <form method="POST" action="?/toggleSubtask" use:enhance class="subtask-row">
                              <input type="hidden" name="subtaskId" value={subtask.id} /><input type="hidden" name="isDone" value={String(subtask.is_done)} />
                              <button type="submit" class:checked={subtask.is_done} class="subtask-check" aria-label={subtask.is_done ? 'Mark subtask incomplete' : 'Mark subtask complete'}>{#if subtask.is_done}<Check size={12} />{/if}</button>
                              <span class:done={subtask.is_done}>{subtask.title}</span>
                              <button type="submit" formaction="?/deleteSubtask" class="subtask-delete" aria-label={`Delete subtask ${subtask.title}`}><Trash2 size={12} /></button>
                            </form>
                          {/each}
                          <form method="POST" action="?/createSubtask" use:enhance class="new-subtask">
                            <input type="hidden" name="taskId" value={task.id} /><input name="title" required maxlength="240" placeholder="Add a subtask…" aria-label="New subtask title" /><button type="submit" aria-label="Add subtask"><Plus size={14} /></button>
                          </form>
                        </div>
                      </details>
                      <form method="POST" action="?/updateStatus" use:enhance={optimisticStatus(task)} class="status-form">
                        <input type="hidden" name="taskId" value={task.id} />
                        <label><span class="sr-only">Change task status</span><select name="status" value={task.status} onchange={(event) => event.currentTarget.form?.requestSubmit()}><option value="todo">To do</option><option value="in-progress">In progress</option><option value="done">Done</option></select><ChevronDown size={13} /></label>
                      </form>
                    </article>
                  {:else}
                    <div class="empty-column"><Circle size={17} /><span>No {statusLabels[status].toLowerCase()} tasks</span></div>
                  {/each}
                </div>
              </div>
            {/each}
          </section>
        {:else}
          <section class="list-view">
            {#each statuses as status}
              <div class="list-group"><h2><span class={`status-dot ${status}`}></span>{statusLabels[status]} <span class="count">{filteredLanes[status].length}</span></h2>
                {#each filteredLanes[status] as task (task.id)}
                  <article class:overdue={isOverdue(task)} class="list-task">
                    <span class="list-priority">{task.priority}</span><strong>{task.title}</strong>
                    <span class="list-due">{task.due_at ? formatDateTime(task.due_at) : 'No due date'}</span>
                    <form method="POST" action="?/updateStatus" use:enhance={optimisticStatus(task)}><input type="hidden" name="taskId" value={task.id} /><select aria-label="Task status" name="status" value={task.status} onchange={(event) => event.currentTarget.form?.requestSubmit()}><option value="todo">To do</option><option value="in-progress">In progress</option><option value="done">Done</option></select></form>
                  </article>
                {/each}
              </div>
            {/each}
          </section>
        {/if}
      {:else}
        <section class="no-project"><ListTodo size={27} /><h2>Start with your first project</h2><p>Create a project to collect tasks and build a plan that works for you.</p><details class="project-create"><summary class="add-project"><Plus size={15} /> New project</summary><form method="POST" action="?/createProject" use:enhance><input name="name" maxlength="100" required placeholder="Project name" /><button type="submit">Create</button></form></details></section>
      {/if}
    </section>
  </main>
  {#if toast}<div class="toast" role="status">{toast}<button onclick={() => (toast = '')} aria-label="Dismiss"><X size={14} /></button></div>{/if}
  <button class="chat-fab" onclick={() => (chatOpen = !chatOpen)} aria-label={chatOpen ? 'Close AI assistant' : 'Open AI assistant'}>
    {#if chatOpen}<X size={18} />{:else}<MessageCircle size={18} />{/if}<span>{chatOpen ? 'Close' : 'Ask AI'}</span>
  </button>
  {#if chatOpen && data.activeProject}
    <aside class="chat-panel" aria-label="Daymark AI assistant">
      <header><span class="chat-sparkle"><Sparkles size={16} /></span><div><strong>Daymark assistant</strong><span>Task-aware help for this project</span></div><button onclick={() => (chatOpen = false)} aria-label="Close assistant"><X size={16} /></button></header>
      <div class="chat-log">
        {#if chatMessages.length === 0}<div class="chat-welcome"><Sparkles size={20} /><strong>What would you like to work on?</strong><span>Ask me to find, organize, or update tasks in this project.</span></div>{/if}
        {#each chatMessages as message, index}
          <div class:from-user={message.role === 'user'} class="chat-message">{message.content || (chatBusy && index === chatMessages.length - 1 ? 'Thinking…' : '')}</div>
        {/each}
      </div>
      <form class="chat-compose" onsubmit={sendChatMessage}>
        <input bind:value={chatInput} maxlength="3000" placeholder="Ask about your tasks…" aria-label="Message the assistant" />
        <button type="submit" disabled={!chatInput.trim() || chatBusy} aria-label="Send message"><Send size={15} /></button>
      </form>
    </aside>
  {/if}
</div>
{/if}

<style>
  :global(body){background:#f7f7f5;color:#26252c}
  .workspace{min-height:100vh;display:grid;grid-template-columns:248px 1fr}
  .sidebar{position:fixed;inset:0 auto 0 0;z-index:3;display:flex;width:248px;flex-direction:column;padding:25px 16px 18px;border-right:1px solid #eeedf0;background:#fff}
  .brand{display:flex;align-items:center;gap:10px;padding:0 8px;color:#252238;text-decoration:none;font:800 20px Manrope,sans-serif;letter-spacing:-1px}
  .brand-icon{display:grid;width:34px;height:34px;place-items:center;border-radius:11px;background:#6d5efc;color:#fff}
  .sidebar-label{margin:45px 9px 12px;color:#aaa8b1;font-size:10px;font-weight:700;letter-spacing:1.3px}
  nav{display:grid;gap:5px}
  nav>a,.add-project,.signout{display:flex;align-items:center;gap:11px;min-height:39px;padding:0 10px;border:0;border-radius:8px;background:none;color:#777580;text-align:left;text-decoration:none;font-size:12px}
  nav>a:hover,.add-project:hover,.signout:hover{background:#f7f6fa;color:#444}
  nav>a.active{background:#f0efff;color:#5144c8;font-weight:700}
  .project-dot{width:8px;height:8px;border-radius:3px;background:var(--project-color)}
  .add-project,.signout{cursor:pointer}
  .project-create{position:relative}
  .project-create summary{list-style:none;cursor:pointer}
  .project-create summary::-webkit-details-marker{display:none}
  .project-create form{position:absolute;z-index:5;top:43px;left:0;display:flex;width:250px;gap:6px;padding:9px;border:1px solid #e9e7ee;border-radius:10px;background:#fff;box-shadow:0 12px 30px #2823331c}
  .project-create input{min-width:0;flex:1;border:1px solid #eceaf1;border-radius:6px;padding:8px;font-size:11px}
  .project-create form button{border:0;border-radius:6px;padding:0 10px;background:#6d5efc;color:white;font-size:11px;cursor:pointer}
  .sidebar-bottom{margin-top:auto}
  .ai-card{display:grid;gap:6px;margin-bottom:17px;padding:13px;border:1px solid #eeeafd;border-radius:10px;background:linear-gradient(145deg,#faf9ff,#f2f0ff);color:#6d5efc}
  .ai-card strong{color:#37344a;font-size:11px}.ai-card span{color:#898696;font-size:10px}
  .signout{width:100%;min-height:42px;border-top:1px solid #f0eff1;border-radius:0}
  .main{grid-column:2;min-width:0}
  .topbar{height:68px;display:flex;align-items:center;justify-content:flex-end;gap:13px;padding:0 4vw;border-bottom:1px solid #eeedf0;background:#fff;color:#888691;font-size:12px}
  .theme-toggle{display:grid;width:31px;height:31px;place-items:center;border:1px solid #eeedf0;border-radius:8px;background:#fff;color:#777481;cursor:pointer}
  .user-avatar{display:grid;width:32px;height:32px;place-items:center;border-radius:50%;background:#e9e6ff;color:#594fc4;font-size:12px;font-weight:700}
  .page-content{max-width:1440px;margin:0 auto;padding:39px clamp(22px,4vw,60px)}
  .page-heading{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:24px}
  .eyebrow{margin:0 0 8px;color:#7d70ec;font-size:10px;font-weight:700;letter-spacing:1.2px}
  h1{margin:0;font:800 31px Manrope,sans-serif;letter-spacing:-1.5px}
  .subheading{margin:7px 0 0;color:#92909a;font-size:12px}
  .date-label{padding-bottom:3px;color:#8b8994;font-size:11px}
  .composer{margin-bottom:19px;padding:12px;border:1px solid #eae8ef;border-radius:13px;background:#fff;box-shadow:0 8px 24px #25213308}
  .ai-quick-form{display:flex;align-items:center;gap:9px;padding:1px 3px 10px;border-bottom:1px solid #f0eff2;color:#796bea}
  .ai-quick-form input{min-width:0;flex:1;border:0;outline:none;color:#35333c;font-size:12px}
  .ai-quick-form input::placeholder{color:#aaa8b1}
  .ai-quick-form button{border:1px solid #e7e3ff;border-radius:7px;padding:7px 10px;background:#f7f6ff;color:#6357d6;font-size:10px;font-weight:700;white-space:nowrap;cursor:pointer}
  .ai-quick-form button:disabled{opacity:.5;cursor:wait}
  .task-form{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;padding:12px 3px 2px}
  .task-form-main{display:grid;min-width:0;flex:1;gap:7px}
  .task-form-main input,.task-form-main textarea{width:100%;resize:vertical;border:0;outline:none;color:#33313a;font-size:12px}
  .task-form-main input{font-weight:700}
  .task-form-main textarea{min-height:22px;max-height:100px}
  .task-form-main input::placeholder,.task-form-main textarea::placeholder{color:#a7a4ad}
  .task-form-options{display:flex;align-items:center;gap:10px}
  .task-form-options select,.date-input{max-width:145px;border:1px solid #efedf2;border-radius:7px;padding:7px 8px;background:#fff;color:#777480;font-size:10px}
  .date-input{display:flex;align-items:center;gap:5px;white-space:nowrap}
  .date-input input{width:125px;min-width:0;border:0;outline:0;color:#777480;font-size:10px}
  .tags-input{width:120px;max-width:145px;border:1px solid #efedf2;border-radius:7px;padding:7px 8px;color:#777480;font-size:10px}
  .add-task-button{display:flex;align-items:center;gap:5px;border:0;border-radius:7px;padding:9px 12px;background:#6d5efc;color:#fff;font-size:11px;font-weight:700;white-space:nowrap;cursor:pointer}
  .add-task-button:hover{background:#594be7}
  .toolbar{display:flex;align-items:center;gap:8px;margin:17px 0}
  .insight-panel{margin:0 0 18px;padding:14px 16px;border:1px solid #e9e5ff;border-radius:11px;background:linear-gradient(120deg,#fff,#faf9ff);color:#77717e}
  .insight-panel>header{display:flex;align-items:center;justify-content:space-between}.insight-panel>header>div{display:flex;align-items:center;gap:7px;color:#665add}.insight-panel>header strong{color:#3e3b49;font-size:11px}.insight-panel>header button{display:grid;width:25px;height:25px;place-items:center;border:0;border-radius:6px;background:transparent;color:#8c8896;cursor:pointer}
  .insight-panel>p{font-size:11px;line-height:1.6}.insight-panel ol{display:grid;gap:5px;padding-left:22px}.insight-panel li{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:10px}
  .summary-columns{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.summary-columns>div{display:grid;align-content:start;gap:6px;padding:9px;border-radius:8px;background:#f6f5fb}.summary-columns strong{color:#55515f;font-size:10px}.summary-columns span{color:#85818d;font-size:9px}
  .search-box,.filter-select{height:36px;display:flex;align-items:center;gap:7px;border:1px solid #eae8ee;border-radius:8px;padding:0 10px;background:#fff;color:#9996a2}
  .search-box{min-width:180px;max-width:290px;flex:1}
  .search-box input{width:100%;border:0;outline:0;color:#393741;font-size:11px}
  .search-box input::placeholder{color:#aaa8b1}
  .filter-select{position:relative}
  .filter-select select{max-width:120px;appearance:none;border:0;outline:0;background:transparent;color:#716e7b;font-size:10px;cursor:pointer}
  .view-toggle{display:flex;gap:2px;padding:3px;border:1px solid #eae8ee;border-radius:8px;background:#fff}
  .view-toggle button{display:grid;width:29px;height:27px;place-items:center;border:0;border-radius:5px;background:transparent;color:#96939f;cursor:pointer}
  .view-toggle button.active{background:#eeecff;color:#6255dc}
  .ai-tool-button{height:35px;display:flex;align-items:center;gap:6px;border:1px solid #e9e5ff;border-radius:8px;padding:0 9px;background:#fbfaff;color:#6e61df;font-size:10px;font-weight:700;white-space:nowrap;cursor:pointer}
  .summary-range{height:35px;border:1px solid #e9e5ff;border-radius:8px;padding:0 8px;background:#fbfaff;color:#6e61df;font-size:10px}
  .board{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));align-items:start;gap:14px}
  .column{min-width:0}
  .column-heading{height:40px;display:flex;align-items:center;gap:8px;padding:0 2px}
  .column-heading h2,.list-group>h2{margin:0;color:#484650;font-size:12px;font-weight:700}
  .status-dot{width:8px;height:8px;border-radius:50%;background:#a4a2ac}
  .status-dot.todo{background:#9693a1}.status-dot.in-progress{background:#e1a336}.status-dot.done{background:#53ae83}
  .count{display:grid;min-width:21px;height:20px;place-items:center;border-radius:6px;background:#eeedf1;color:#807e89;font-size:10px}
  .task-zone{display:grid;min-height:150px;align-content:start;gap:9px;padding:2px 2px 30px;border-radius:10px}
  .task-card{min-width:0;padding:13px;border:1px solid #e9e7ec;border-radius:10px;background:#fff;box-shadow:0 4px 13px #27233306;cursor:grab}
  .task-card:active{cursor:grabbing}
  .task-card.overdue{border-color:#f2c8c3}
  .card-topline{display:flex;align-items:center;justify-content:space-between}
  .priority-pill{padding:4px 6px;border-radius:5px;font-size:8px;font-weight:800;letter-spacing:.5px}
  .priority-pill.high{background:#fff0ef;color:#d35f54}.priority-pill.med{background:#fff8e7;color:#ad7d20}.priority-pill.low{background:#eff7f3;color:#4f9978}
  .icon-button{display:grid;width:25px;height:25px;place-items:center;border:0;border-radius:6px;background:transparent;color:#a5a2ad;cursor:pointer}
  .icon-button:hover{background:#fff0ef;color:#cf574c}
  .task-card h3{margin:8px 0 0;color:#393741;font-size:12px;font-weight:700;line-height:1.5;overflow-wrap:anywhere}
  .task-description{display:-webkit-box;overflow:hidden;margin:5px 0 0;color:#898691;font-size:10px;line-height:1.55;line-clamp:3;-webkit-box-orient:vertical;-webkit-line-clamp:3}
  .due-line{display:flex;align-items:center;gap:5px;margin:9px 0 0;color:#8b8894;font-size:9px}
  .due-line.overdue-text{color:#c74f45;font-weight:700}
  .task-tag{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:4px 7px;background:color-mix(in srgb,var(--tag-color) 12%,white);color:var(--tag-color);font-size:9px}
  .tag-row{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
  .suggested-tag-count{display:inline-flex;align-items:center;gap:4px;margin-top:8px;color:#7669e7;font-size:9px}
  .suggested-tags{display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin-top:8px;color:#7669e7;font-size:9px}
  .suggested-tags>span:first-child{display:inline-flex;align-items:center;gap:4px}
  .suggested-tag{padding:3px 6px;border-radius:999px;background:#f2f0ff;color:#665bd1;font-size:8px}
  .apply-suggestions-form button{border:0;border-radius:5px;padding:5px 7px;background:#f2f0ff;color:#665bd1;font-size:9px;font-weight:700;cursor:pointer}
  .task-details{margin-top:10px;border-top:1px solid #f1f0f3}
  .task-details>summary{display:flex;align-items:center;justify-content:space-between;padding:8px 0 3px;color:#83808d;font-size:9px;cursor:pointer;list-style:none}
  .task-details>summary::-webkit-details-marker{display:none}
  .edit-task-form{display:grid;gap:8px;padding:8px 0}
  .edit-task-form label{display:grid;gap:4px;color:#85828d;font-size:9px}
  .edit-task-form input,.edit-task-form textarea,.edit-task-form select{width:100%;min-width:0;border:1px solid #eae8ee;border-radius:6px;padding:7px;background:white;color:#42404a;font-size:10px}
  .edit-task-form textarea{resize:vertical}
  .edit-row{display:grid;grid-template-columns:1fr 1.5fr;gap:6px}
  .save-button{justify-self:start;border:0;border-radius:6px;padding:7px 9px;background:#eeecff;color:#5d51d0;font-size:9px;font-weight:700;cursor:pointer}
  .subtasks{display:grid;gap:7px;padding:10px 0;border-top:1px solid #f1f0f3}
  .subtask-heading{display:flex;align-items:center;justify-content:space-between;color:#5b5963;font-size:10px}
  .text-button{display:flex;align-items:center;gap:4px;border:0;background:transparent;color:#776ae7;font-size:9px;cursor:pointer}
  .subtask-row{display:flex;align-items:center;gap:7px;color:#6d6a75;font-size:10px}
  .subtask-delete{display:grid;width:22px;height:22px;flex:none;place-items:center;border:0;border-radius:5px;background:transparent;color:#aaa6b2;cursor:pointer}.subtask-delete:hover{background:#fff0ef;color:#c7584f}
  .subtask-row span{overflow-wrap:anywhere}.subtask-row span.done{text-decoration:line-through;color:#a6a3ad}
  .subtask-check{display:grid;width:17px;height:17px;flex:none;place-items:center;border:1px solid #dcd9e4;border-radius:5px;background:white;color:white;cursor:pointer}
  .subtask-check.checked{border-color:#6d5efc;background:#6d5efc}
  .new-subtask{display:flex;align-items:center;gap:5px}
  .new-subtask input{min-width:0;flex:1;border:0;border-bottom:1px solid #eeedf1;padding:6px 1px;color:#4c4a53;font-size:10px;outline:none}
  .new-subtask button{display:grid;width:23px;height:23px;place-items:center;border:0;border-radius:5px;background:#f2f0ff;color:#695ce0;cursor:pointer}
  .status-form{display:flex;justify-content:flex-end;margin-top:8px}
  .status-form label{position:relative;display:flex;align-items:center}
  .status-form select,.list-task select{appearance:none;border:0;border-radius:6px;padding:6px 20px 6px 8px;background:#f7f6fa;color:#797682;font-size:9px;cursor:pointer}
  .status-form label :global(svg){position:absolute;right:5px;pointer-events:none;color:#92909b}
  .empty-column{display:flex;min-height:100px;flex-direction:column;align-items:center;justify-content:center;gap:8px;border:1px dashed #e6e4eb;border-radius:10px;color:#aaa7b2;font-size:10px}
  .list-view{display:grid;gap:22px}
  .list-group>h2{display:flex;align-items:center;gap:8px;margin-bottom:9px}
  .list-task{display:grid;grid-template-columns:75px minmax(100px,1fr) minmax(110px,auto) 100px;align-items:center;gap:12px;min-height:48px;padding:8px 12px;border:1px solid #eeedf1;border-radius:8px;background:#fff}
  .list-task.overdue{border-color:#f2c8c3}
  .list-task strong{overflow:hidden;color:#46444e;font-size:11px;text-overflow:ellipsis;white-space:nowrap}
  .list-priority{color:#817d8a;font-size:10px;text-transform:capitalize}
  .list-due{color:#918e99;font-size:10px}
  .list-task select{width:100%}
  .no-project{display:flex;min-height:300px;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#766be2}
  .no-project h2{margin:14px 0 3px;color:#383640;font-size:18px}.no-project p{max-width:350px;color:#8c8994;font-size:12px;line-height:1.6}
  .no-project .project-create{margin-top:10px}
  .toast{position:fixed;left:22px;bottom:20px;z-index:10;display:flex;align-items:center;gap:14px;max-width:min(420px,calc(100vw - 160px));padding:12px 14px;border:1px solid #e7e4f5;border-radius:9px;background:#fff;color:#504b67;box-shadow:0 10px 35px #2521331f;font-size:11px}
  .toast button{display:grid;width:20px;height:20px;place-items:center;border:0;border-radius:5px;background:#f2f0fa;color:#777;cursor:pointer}
  .chat-fab{position:fixed;right:22px;bottom:20px;z-index:8;display:flex;align-items:center;gap:8px;border:0;border-radius:999px;padding:12px 17px;background:#6658e7;color:#fff;box-shadow:0 8px 24px #493ab942;font-size:11px;font-weight:700;cursor:pointer}
  .chat-fab:hover{background:#5547d2}
  .chat-panel{position:fixed;right:22px;bottom:75px;z-index:7;display:flex;width:min(360px,calc(100vw - 28px));height:min(510px,calc(100vh - 110px));flex-direction:column;overflow:hidden;border:1px solid #e8e6ef;border-radius:15px;background:#fff;box-shadow:0 18px 60px #2521332a}
  .chat-panel>header{display:flex;align-items:center;gap:9px;padding:14px;border-bottom:1px solid #efedf3}
  .chat-sparkle{display:grid;width:33px;height:33px;place-items:center;border-radius:10px;background:#f0edff;color:#6d5efc}
  .chat-panel>header>div{display:grid;flex:1;gap:3px}.chat-panel>header strong{color:#393741;font-size:11px}.chat-panel>header span{color:#96939e;font-size:9px}
  .chat-panel>header button{display:grid;width:27px;height:27px;place-items:center;border:0;border-radius:6px;background:transparent;color:#96939e;cursor:pointer}
  .chat-log{display:flex;flex:1;flex-direction:column;gap:9px;overflow-y:auto;padding:14px}
  .chat-welcome{display:grid;justify-items:center;gap:9px;margin:auto;text-align:center;color:#776be6}.chat-welcome strong{color:#45434d;font-size:12px}.chat-welcome span{max-width:240px;color:#928f9b;font-size:10px;line-height:1.6}
  .chat-message{align-self:flex-start;max-width:88%;white-space:pre-wrap;border-radius:10px 10px 10px 3px;padding:9px 11px;background:#f5f4f8;color:#494752;font-size:11px;line-height:1.6}
  .chat-message.from-user{align-self:flex-end;border-radius:10px 10px 3px 10px;background:#6d5efc;color:#fff}
  .chat-compose{display:flex;align-items:center;gap:7px;margin:10px;padding:6px;border:1px solid #e8e6ef;border-radius:9px}
  .chat-compose input{min-width:0;flex:1;border:0;outline:0;padding:6px;color:#44414c;font-size:11px}
  .chat-compose button{display:grid;width:30px;height:30px;place-items:center;border:0;border-radius:7px;background:#6d5efc;color:#fff;cursor:pointer}.chat-compose button:disabled{opacity:.4;cursor:wait}
  :global(html[data-theme='dark']) :global(body){background:#17161d;color:#e7e5ed}
  :global(html[data-theme='dark']) .sidebar,:global(html[data-theme='dark']) .topbar,:global(html[data-theme='dark']) .composer,:global(html[data-theme='dark']) .task-card,:global(html[data-theme='dark']) .list-task,:global(html[data-theme='dark']) .chat-panel,:global(html[data-theme='dark']) .insight-panel{border-color:#34313f;background:#22212a;color:#e8e6ee}
  :global(html[data-theme='dark']) .brand,:global(html[data-theme='dark']) h1,:global(html[data-theme='dark']) .task-card h3,:global(html[data-theme='dark']) .insight-panel>header strong,:global(html[data-theme='dark']) .list-task strong{color:#f0eef5}
  :global(html[data-theme='dark']) .column-heading h2,:global(html[data-theme='dark']) .list-group>h2,:global(html[data-theme='dark']) .subheading,:global(html[data-theme='dark']) .task-description,:global(html[data-theme='dark']) .due-line,:global(html[data-theme='dark']) .date-label{color:#a6a2b1}
  :global(html[data-theme='dark']) .search-box,:global(html[data-theme='dark']) .filter-select,:global(html[data-theme='dark']) .view-toggle,:global(html[data-theme='dark']) .theme-toggle{border-color:#383643;background:#2a2933;color:#b8b4c3}
  :global(html[data-theme='dark']) .summary-range{border-color:#383643;background:#2a2933;color:#c1b9ff}
  :global(html[data-theme='dark']) .search-box input,:global(html[data-theme='dark']) .task-form-main input,:global(html[data-theme='dark']) .task-form-main textarea,:global(html[data-theme='dark']) .chat-compose input{background:transparent;color:#eae8ef}
  :global(html[data-theme='dark']) .chat-message{background:#33313c;color:#e5e2ed}
  :global(html[data-theme='dark']) .chat-compose{border-color:#3b3946}
  .inline-message{margin:0 0 12px;padding:10px 12px;border-radius:7px;background:#fff3f1;color:#b64d42;font-size:11px}
  .inline-message.error{margin:8px 3px 0;background:#fff3f1}
  .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
  @media(max-width:1050px){.sidebar{width:220px}.workspace{grid-template-columns:220px 1fr}.task-form{align-items:stretch;flex-direction:column}.task-form-options{justify-content:flex-start;flex-wrap:wrap}.toolbar{flex-wrap:wrap}.search-box{max-width:none}}
  @media(max-width:760px){.workspace{grid-template-columns:1fr}.sidebar{position:relative;width:auto;height:auto;min-height:0;flex-direction:row;align-items:center;justify-content:space-between;padding:12px 16px;border-right:0;border-bottom:1px solid #eeedf0}.sidebar-label,.sidebar nav,.ai-card{display:none}.sidebar-bottom{margin:0}.signout{width:auto;border:0}.main{grid-column:1}.topbar{height:55px}.page-content{padding:30px 16px}.page-heading{align-items:flex-start;gap:12px}.date-label{max-width:120px;text-align:right;line-height:1.5}.board{grid-template-columns:1fr;gap:8px}.column-heading{height:37px}.task-zone{min-height:55px;padding-bottom:10px}.task-card{padding:12px}.task-form-options{flex-wrap:wrap;justify-content:flex-start}.toolbar{gap:6px}.search-box{min-width:100%;order:1}.filter-select{flex:1;justify-content:space-between}.ai-tool-button span{display:none}.list-task{grid-template-columns:48px minmax(80px,1fr) minmax(90px,auto);gap:7px}.list-task form{grid-column:2/-1}.list-due{text-align:right}}
  @media(max-width:480px){.toast{left:12px;max-width:calc(100vw - 140px)}.summary-columns{grid-template-columns:1fr}.summary-range{max-width:100px}}
  @media(max-width:420px){.date-label{display:none}.task-form-options select{max-width:120px}.date-input input{width:108px}.task-form-options{gap:6px}.list-task{grid-template-columns:45px minmax(70px,1fr) minmax(80px,auto)}}
</style>
