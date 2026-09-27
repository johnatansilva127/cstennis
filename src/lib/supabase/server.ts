import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/env";
import { hardenCookie, sessionCookieOptions } from "./cookies";
import type { Database } from "@/lib/database.types";

/**
 * Cliente Supabase por requisição, autenticado pelo cookie de sessão do
 * usuário. Todas as consultas passam por RLS/RPC com a identidade do usuário.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const e = env();
  return createServerClient<Database>(e.SUPABASE_URL, e.SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: sessionCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, hardenCookie(options));
          }
        } catch {
          // Server Components não podem gravar cookies; o proxy renova a sessão.
        }
      },
    },
  });
}
