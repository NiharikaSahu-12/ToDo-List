import { createServerClient } from "@supabase/ssr";
import { redirect, type Handle } from "@sveltejs/kit";
import { env } from "$env/dynamic/public";

export const handle: Handle = async ({ event, resolve }) => {
  const supabaseUrl = env.PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = env.PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase is not configured. Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  event.locals.supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => event.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          event.cookies.set(name, value, { ...options, path: "/" });
        });
      },
    },
  });

  event.locals.safeGetSession = async () => {
    const {
      data: { session },
      error: sessionError,
    } = await event.locals.supabase.auth.getSession();

    if (sessionError) {
      console.error("Supabase session lookup failed:", sessionError);
      return { session: null, user: null };
    }

    if (!session) {
      return { session: null, user: null };
    }

    const {
      data: { user },
      error,
    } = await event.locals.supabase.auth.getUser();

    if (error) {
      console.error("Supabase user verification failed:", error);
      return { session: null, user: null };
    }

    return { session, user };
  };

  const { user } = await event.locals.safeGetSession();
  event.locals.user = user;

  if (event.url.pathname.startsWith("/app") && !user) {
    redirect(303, "/login");
  }

  if (
    (event.url.pathname === "/login" || event.url.pathname === "/signup") &&
    user
  ) {
    redirect(303, "/app");
  }

  return resolve(event, {
    filterSerializedResponseHeaders(name) {
      return name === "content-range" || name === "x-supabase-api-version";
    },
  });
};
