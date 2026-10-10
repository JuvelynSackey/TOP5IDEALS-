"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "./database.types";

let browserClient: SupabaseClient<Database> | undefined;

/** Browser client (anon/publishable key + the user's session cookies). */
export function getBrowserClient(): SupabaseClient<Database> {
  if (!browserClient) {
    const { supabaseUrl, supabaseKey } = getPublicEnv();
    browserClient = createBrowserClient<Database>(supabaseUrl, supabaseKey);
  }
  return browserClient;
}
