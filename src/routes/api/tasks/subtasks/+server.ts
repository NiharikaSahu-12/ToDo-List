import type { RequestHandler } from "./$types";
import { json } from "@sveltejs/kit";
import { subtaskBulkCreateSchema } from "$lib/schemas/tasks";

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user)
    return json({ error: "Authentication required." }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  const parsed = subtaskBulkCreateSchema.safeParse(body);
  if (!parsed.success)
    return json({ error: "Invalid subtask list." }, { status: 400 });

  const { error } = await locals.supabase.rpc("create_subtasks", {
    p_task_id: parsed.data.taskId,
    p_titles: parsed.data.titles,
  });
  if (error) {
    console.error("Could not save generated subtasks", error);
    return json(
      { error: "Generated subtasks could not be saved." },
      { status: 500 },
    );
  }
  return json({ success: true });
};
