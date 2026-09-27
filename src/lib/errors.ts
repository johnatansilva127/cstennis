import type { PostgrestError } from "@supabase/supabase-js";

export type FieldErrors = Record<string, string>;

export type ActionState<T = unknown> = {
  ok: boolean;
  message?: string;
  fieldErrors?: FieldErrors;
  values?: Record<string, string>;
  data?: T;
  redirectTo?: string;
  /** Código de erro de negócio (ex.: CS428 = precisa confirmar MFA). */
  code?: string;
};

export const initialState: ActionState = { ok: false };

const GENERIC = "Não foi possível concluir a operação. Tente novamente em instantes.";

/**
 * Converte erros do banco em mensagens seguras. Apenas erros de negócio
 * (SQLSTATE CS4xx, mensagens escritas em pt-BR nas funções) são exibidos
 * literalmente; qualquer outro erro vira mensagem genérica e é registrado sem
 * dados sensíveis.
 */
export function dbErrorMessage(error: Pick<PostgrestError, "code" | "message"> | null | undefined): string {
  if (!error) return GENERIC;
  if (error.code?.startsWith("CS4")) return error.message;
  if (error.code === "42501") return "Você não tem permissão para esta ação.";
  if (error.code === "PGRST301" || error.code === "PGRST303") return "Sessão expirada. Entre novamente.";
  if (error.code === "23505") return "Registro duplicado.";
  if (error.code === "23P01") return "Conflito de período com um registro existente.";
  logServerError("db", error);
  return GENERIC;
}

export function fromDbError(
  error: Pick<PostgrestError, "code" | "message">,
  values?: Record<string, string>,
): ActionState {
  return { ok: false, message: dbErrorMessage(error), values, code: error.code };
}

/** Log estruturado sem payloads, tokens ou dados pessoais. */
export function logServerError(scope: string, error: unknown) {
  const e = error as { code?: string; message?: string; name?: string };
  console.error(JSON.stringify({ level: "error", scope, code: e?.code, name: e?.name, message: e?.message?.slice(0, 200) }));
}

export function formValues(formData: FormData, keys: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const k of keys) {
    const v = formData.get(k);
    if (typeof v === "string") values[k] = v;
  }
  return values;
}
