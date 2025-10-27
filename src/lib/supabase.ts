import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAnon = process.env.SUPABASE_ANON_KEY;
  const supabaseKey = supabaseServiceRole ?? supabaseAnon;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase configuration. Set SUPABASE_URL and a service or anon key.");
  }

  supabaseClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
    },
  });

  return supabaseClient;
}
