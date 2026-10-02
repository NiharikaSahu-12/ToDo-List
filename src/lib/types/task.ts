import type { TaskPriority, TaskStatus } from "$lib/schemas/tasks";

export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  is_done: boolean;
  position: number;
}

export interface Task {
  id: string;
  user_id: string;
  project_id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  due_at: string | null;
  reminder_at: string | null;
  position: number;
  recurrence_rule: Record<string, unknown> | null;
  estimated_minutes: number | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  subtasks: Subtask[];
  task_tags: Array<{
    tag_id: string;
    tags: { id: string; name: string; color: string } | null;
  }>;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  color?: string;
  is_default: boolean;
}
