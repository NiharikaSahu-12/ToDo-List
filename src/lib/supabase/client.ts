import { createBrowserClient } from "@supabase/ssr";
import { env } from "$env/dynamic/public";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | undefined;

export const getSupabaseBrowserClient = () => {
  const supabaseUrl = env.PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = env.PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase is not configured. Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  browserClient ??= createBrowserClient(supabaseUrl, supabaseAnonKey);
  return browserClient;
};
