import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { taskReorderSchema } from "$lib/schemas/tasks";

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user)
    return json({ error: "Authentication required." }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  const parsed = taskReorderSchema.safeParse(body);
  if (!parsed.success)
    return json({ error: "Invalid task order." }, { status: 400 });

  const { error } = await locals.supabase.rpc("reorder_tasks", {
    p_tasks: parsed.data.tasks,
  });
  if (error) {
    console.error("Could not persist task order", error);
    return json({ error: "Task order could not be saved." }, { status: 500 });
  }

  return json({ success: true });
};
