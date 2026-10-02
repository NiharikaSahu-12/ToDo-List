import { fail, redirect } from "@sveltejs/kit";
import type { Actions } from "./$types";
import { env } from "$env/dynamic/public";
import { signupSchema } from "$lib/schemas/auth";

export const actions: Actions = {
  default: async ({ request, locals, url }) => {
    const formData = await request.formData();
    const parsed = signupSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword"),
    });

    if (!parsed.success) {
      const message =
        parsed.error.issues[0]?.message ?? "Account details are invalid.";
      return fail(400, { message, email: String(formData.get("email") ?? "") });
    }

    const { email, password } = parsed.data;
    const { data, error } = await locals.supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: new URL(
          "/auth/callback",
          env.PUBLIC_APP_URL || url.origin,
        ).toString(),
      },
    });
    if (error)
      return fail(400, {
        message:
          "Could not create your account. Check the details and try again.",
        email,
      });
    if (data.session) redirect(303, "/app");
    return { message: "Check your email for a confirmation link.", email };
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
      return fail(500, { message: "Google sign-up could not be started." });
    redirect(303, data.url);
  },
};
