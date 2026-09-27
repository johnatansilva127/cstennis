import "server-only";
import { actionAuth, isAuthed } from "@/lib/auth";
import { fromDbError, type ActionState } from "@/lib/errors";
import type { SupabaseClient } from "@supabase/supabase-js";

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function opt(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v === "" ? null : v;
}

export function allValues(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.startsWith("$ACTION")) out[k] = v;
  return out;
}

/** Executa uma RPC com a sessão do usuário e converte o resultado em ActionState. */
export async function runRpc<T = unknown>(
  kind: "coach" | "participant" | "any",
  fn: string,
  args: Record<string, unknown>,
  opts: { values?: Record<string, string>; success?: string; redirectTo?: string | ((data: T) => string) } = {},
): Promise<ActionState<T>> {
  const auth = await actionAuth(kind);
  if (!isAuthed(auth)) return auth as ActionState<T>;
  // Nome da função dinâmico: usa o cliente sem tipagem de RPC (argumentos validados no banco).
  const { data, error } = await (auth.supabase as unknown as SupabaseClient).rpc(fn, args);
  if (error) return fromDbError(error, opts.values) as ActionState<T>;
  const redirectTo = typeof opts.redirectTo === "function" ? opts.redirectTo(data as T) : opts.redirectTo;
  return { ok: true, message: opts.success, data: data as T, redirectTo };
}
