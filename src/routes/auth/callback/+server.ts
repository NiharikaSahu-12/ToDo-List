import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, locals }) => {
  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(303, "/app");
  }
  redirect(303, "/login?error=auth");
};
