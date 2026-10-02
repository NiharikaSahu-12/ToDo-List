import type { SupabaseClient, User } from "@supabase/supabase-js";

declare global {
  namespace App {
    interface Locals {
      supabase: SupabaseClient;
      safeGetSession: () => Promise<{
        session: import("@supabase/supabase-js").Session | null;
        user: User | null;
      }>;
      user: User | null;
    }

    interface PageData {
      user?: User | null;
    }
  }
}

export {};
