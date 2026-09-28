import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Cliente com service role. Uso restrito a operações de servidor que já
 * passaram por verificação de autorização (upload/download de comprovantes,
 * convites, rate limit, jobs). Nunca exposto ao cliente.
 */
export function createSupabaseAdminClient() {
  const e = env();
  return createClient(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
