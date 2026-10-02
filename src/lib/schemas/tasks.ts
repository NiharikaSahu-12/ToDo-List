import { z } from "zod";

export const taskPrioritySchema = z.enum(["low", "med", "high"]);
export const taskStatusSchema = z.enum(["todo", "in-progress", "done"]);
const estimatedMinutesSchema = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.coerce.number().int().min(1).max(10080).nullable(),
);

export const taskCreateSchema = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(5000).default(""),
  projectId: z.string().uuid(),
  priority: taskPrioritySchema.default("med"),
  dueAt: z.iso.datetime({ offset: true }).nullable().default(null),
  reminderAt: z.iso.datetime({ offset: true }).nullable().default(null),
  recurrence: z.enum(["none", "daily", "weekly", "monthly"]).default("none"),
  tags: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
  estimatedMinutes: estimatedMinutesSchema.default(null),
});

export const taskUpdateSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(5000),
  priority: taskPrioritySchema,
  dueAt: z.iso.datetime({ offset: true }).nullable(),
  reminderAt: z.iso.datetime({ offset: true }).nullable(),
  recurrence: z.enum(["none", "daily", "weekly", "monthly"]),
  tags: z.array(z.string().trim().min(1).max(40)).max(8),
  estimatedMinutes: estimatedMinutesSchema,
});

export const taskStatusUpdateSchema = z.object({
  taskId: z.string().uuid(),
  status: taskStatusSchema,
});

export const taskDeleteSchema = z.object({ taskId: z.string().uuid() });
export const projectCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
export const taskReorderSchema = z.object({
  tasks: z
    .array(
      z.object({
        id: z.string().uuid(),
        status: taskStatusSchema,
        position: z.number().finite().min(0),
      }),
    )
    .min(1)
    .max(500),
});
export const subtaskCreateSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().trim().min(1).max(240),
});
export const subtaskToggleSchema = z.object({
  subtaskId: z.string().uuid(),
  isDone: z.enum(["true", "false"]),
});
export const subtaskDeleteSchema = z.object({ subtaskId: z.string().uuid() });
export const subtaskBulkCreateSchema = z.object({
  taskId: z.string().uuid(),
  titles: z.array(z.string().trim().min(1).max(240)).min(2).max(12),
});

export const aiQuickAddInputSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  timezone: z.string().trim().min(1).max(64).default("UTC"),
});
export const aiQuickAddOutputSchema = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().max(2000).default(""),
  priority: taskPrioritySchema,
  dueAt: z.iso.datetime({ offset: true }).nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
});
export const aiBreakdownInputSchema = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(2000).default(""),
});
export const aiBreakdownOutputSchema = z.object({
  subtasks: z.array(z.string().trim().min(1).max(240)).min(2).max(12),
});
export const aiPrioritizeInputSchema = z.object({
  tasks: z
    .array(
      z.object({
        id: z.string().uuid(),
        title: z.string().trim().min(1).max(240),
        priority: taskPrioritySchema,
        dueAt: z.iso.datetime({ offset: true }).nullable(),
        status: taskStatusSchema,
      }),
    )
    .min(1)
    .max(100),
});
export const aiPrioritizeOutputSchema = z.object({
  orderedTaskIds: z.array(z.string().uuid()),
  reasoning: z.string().trim().min(1).max(2000),
});
export const aiSummaryInputSchema = z.object({
  range: z.enum(["day", "week"]).default("day"),
  tasks: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(240),
        status: taskStatusSchema,
        dueAt: z.iso.datetime({ offset: true }).nullable(),
        createdAt: z.iso.datetime({ offset: true }),
        completedAt: z.iso.datetime({ offset: true }).nullable(),
      }),
    )
    .max(500),
});
export const aiSummaryOutputSchema = z.object({
  completed: z.array(z.string().max(240)).max(100),
  overdue: z.array(z.string().max(240)).max(100),
  focus: z.array(z.string().max(240)).max(100),
  summary: z.string().trim().min(1).max(2000),
});
export const aiAutoTagInputSchema = z.object({
  tasks: z
    .array(
      z.object({
        id: z.string().uuid(),
        title: z.string().trim().min(1).max(240),
        description: z.string().max(1000).default(""),
      }),
    )
    .min(1)
    .max(30),
});
export const aiAutoTagOutputSchema = z.object({
  tasks: z.array(
    z.object({
      id: z.string().uuid(),
      tags: z.array(z.string().trim().min(1).max(40)).max(8),
      estimatedMinutes: z.number().int().min(1).max(10080),
    }),
  ),
});
export const aiChatInputSchema = z.object({
  projectId: z.string().uuid(),
  message: z.string().trim().min(1).max(3000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(3000),
      }),
    )
    .max(20)
    .default([]),
});

export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
