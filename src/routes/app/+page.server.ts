import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import {
  projectCreateSchema,
  subtaskCreateSchema,
  subtaskDeleteSchema,
  subtaskToggleSchema,
  taskCreateSchema,
  taskDeleteSchema,
  taskStatusUpdateSchema,
  taskUpdateSchema,
} from "$lib/schemas/tasks";
import type { Task } from "$lib/types/task";

const formObject = async (request: Request) =>
  Object.fromEntries(await request.formData());

const normalizeDueAt = (value: unknown) => {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
};

export const load: PageServerLoad = async ({ locals, url }) => {
  const { data: projects, error: projectError } = await locals.supabase
    .from("projects")
    .select("id, name, description, color, is_default")
    .order("position");

  if (projectError) throw projectError;
  const projectList = projects ?? [];
  const requestedProject = url.searchParams.get("project");
  const activeProject =
    projectList.find((project) => project.id === requestedProject) ??
    projectList.find((project) => project.is_default) ??
    projectList[0];

  if (!activeProject)
    return { projects: projectList, activeProject: null, tasks: [], tags: [] };

  const { data: tasks, error: taskError } = await locals.supabase
    .from("tasks")
    .select("*, subtasks(*), task_tags(tag_id, tags(id, name, color))")
    .eq("project_id", activeProject.id)
    .order("position")
    .order("created_at", { ascending: false });

  if (taskError) throw taskError;
  const taskList = (tasks ?? []) as Task[];
  const tags = Array.from(
    new Map(
      taskList
        .flatMap((task) =>
          task.task_tags.flatMap((link) => (link.tags ? [link.tags] : [])),
        )
        .map((tag) => [tag.id, tag]),
    ).values(),
  ).sort((left, right) => left.name.localeCompare(right.name));
  return {
    projects: projectList,
    activeProject,
    tasks: taskList,
    tags,
  };
};

export const actions: Actions = {
  createTask: async ({ request, locals }) => {
    const raw = await formObject(request);
    const parsed = taskCreateSchema.safeParse({
      ...raw,
      dueAt: normalizeDueAt(raw.dueAt),
      reminderAt: normalizeDueAt(raw.reminderAt),
      priority: raw.priority || "med",
      description: raw.description || "",
      recurrence: raw.recurrence || "none",
      tags:
        typeof raw.tags === "string"
          ? raw.tags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean)
          : [],
      estimatedMinutes: raw.estimatedMinutes ? raw.estimatedMinutes : null,
    });
    if (!parsed.success)
      return fail(400, {
        action: "createTask",
        message: "Check the task details and try again.",
      });

    const { error } = await locals.supabase.rpc("create_task_with_tags", {
      p_project_id: parsed.data.projectId,
      p_title: parsed.data.title,
      p_description: parsed.data.description,
      p_priority: parsed.data.priority,
      p_due_at: parsed.data.dueAt,
      p_reminder_at: parsed.data.reminderAt,
      p_recurrence_rule:
        parsed.data.recurrence === "none"
          ? null
          : { frequency: parsed.data.recurrence, interval: 1 },
      p_estimated_minutes: parsed.data.estimatedMinutes,
      p_tags: parsed.data.tags,
    });
    if (error) throw error;
    return { action: "createTask", success: true };
  },

  updateTask: async ({ request, locals }) => {
    const raw = await formObject(request);
    const parsed = taskUpdateSchema.safeParse({
      ...raw,
      dueAt: normalizeDueAt(raw.dueAt),
      reminderAt: normalizeDueAt(raw.reminderAt),
      recurrence: raw.recurrence || "none",
      tags:
        typeof raw.tags === "string"
          ? raw.tags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean)
          : [],
      estimatedMinutes: raw.estimatedMinutes ? raw.estimatedMinutes : null,
    });
    if (!parsed.success)
      return fail(400, {
        action: "updateTask",
        message: "Task details are invalid.",
      });

    const { error } = await locals.supabase.rpc("update_task_details", {
      p_task_id: parsed.data.taskId,
      p_title: parsed.data.title,
      p_description: parsed.data.description,
      p_priority: parsed.data.priority,
      p_due_at: parsed.data.dueAt,
      p_reminder_at: parsed.data.reminderAt,
      p_recurrence_rule:
        parsed.data.recurrence === "none"
          ? null
          : { frequency: parsed.data.recurrence, interval: 1 },
      p_estimated_minutes: parsed.data.estimatedMinutes,
      p_tags: parsed.data.tags,
    });
    if (error) throw error;
    return { action: "updateTask", success: true };
  },

  updateStatus: async ({ request, locals }) => {
    const parsed = taskStatusUpdateSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        action: "updateStatus",
        message: "Task status is invalid.",
      });
    const { taskId, status } = parsed.data;
    const { data, error } = await locals.supabase
      .from("tasks")
      .update({
        status,
        completed_at: status === "done" ? new Date().toISOString() : null,
      })
      .eq("id", taskId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data)
      return fail(404, {
        action: "updateStatus",
        message: "Task was not found.",
      });
    return { action: "updateStatus", success: true };
  },

  deleteTask: async ({ request, locals }) => {
    const parsed = taskDeleteSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        action: "deleteTask",
        message: "Task could not be deleted.",
      });
    const { data, error } = await locals.supabase
      .from("tasks")
      .delete()
      .eq("id", parsed.data.taskId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data)
      return fail(404, {
        action: "deleteTask",
        message: "Task was not found.",
      });
    return { action: "deleteTask", success: true };
  },

  createProject: async ({ request, locals }) => {
    const parsed = projectCreateSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        action: "createProject",
        message: "Project name must be between 1 and 100 characters.",
      });
    const { data: lastProject, error: positionError } = await locals.supabase
      .from("projects")
      .select("position")
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (positionError) throw positionError;
    const { data, error } = await locals.supabase
      .from("projects")
      .insert({
        user_id: locals.user!.id,
        name: parsed.data.name,
        position: (lastProject?.position ?? 0) + 1,
      })
      .select("id")
      .single();
    if (error) throw error;
    redirect(303, `/app?project=${data.id}`);
  },

  createSubtask: async ({ request, locals }) => {
    const parsed = subtaskCreateSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        action: "createSubtask",
        message: "Subtask title is required.",
      });
    const { data: lastSubtask, error: positionError } = await locals.supabase
      .from("subtasks")
      .select("position")
      .eq("task_id", parsed.data.taskId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (positionError) throw positionError;
    const { error } = await locals.supabase.from("subtasks").insert({
      user_id: locals.user!.id,
      task_id: parsed.data.taskId,
      title: parsed.data.title,
      position: (lastSubtask?.position ?? 0) + 1,
    });
    if (error) throw error;
    return { action: "createSubtask", success: true };
  },

  toggleSubtask: async ({ request, locals }) => {
    const parsed = subtaskToggleSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        action: "toggleSubtask",
        message: "Subtask could not be updated.",
      });
    const { data, error } = await locals.supabase
      .from("subtasks")
      .update({ is_done: parsed.data.isDone !== "true" })
      .eq("id", parsed.data.subtaskId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data)
      return fail(404, {
        action: "toggleSubtask",
        message: "Subtask was not found.",
      });
    return { action: "toggleSubtask", success: true };
  },

  deleteSubtask: async ({ request, locals }) => {
    const parsed = subtaskDeleteSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        action: "deleteSubtask",
        message: "Subtask could not be deleted.",
      });
    const { data, error } = await locals.supabase
      .from("subtasks")
      .delete()
      .eq("id", parsed.data.subtaskId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data)
      return fail(404, {
        action: "deleteSubtask",
        message: "Subtask was not found.",
      });
    return { action: "deleteSubtask", success: true };
  },
};
