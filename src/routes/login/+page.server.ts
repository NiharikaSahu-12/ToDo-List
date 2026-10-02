import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { env } from "$env/dynamic/public";
import { loginSchema } from "$lib/schemas/auth";

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) redirect(303, "/app");
  return {};
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    const formData = await request.formData();
    const parsed = loginSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    if (!parsed.success) {
      return fail(400, {
        message: "Enter a valid email and password.",
        email: String(formData.get("email") ?? ""),
      });
    }
    const { email, password } = parsed.data;
    const { error } = await locals.supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error)
      return fail(400, {
        message: "Email or password was not accepted.",
        email,
      });
    redirect(303, "/app");
  },
  google: async ({ locals, url }) => {
    const redirectTo = new URL(
      "/auth/callback",
      env.PUBLIC_APP_URL || url.origin,
    ).toString();
    const { data, error } = await locals.supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (error || !data.url)
      return fail(500, { message: "Google sign-in could not be started." });
    redirect(303, data.url);
  },
};
