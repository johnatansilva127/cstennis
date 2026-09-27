import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** IP do cliente (cabeçalho do provedor de hospedagem); nunca armazenado em claro. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function hashKey(value: string) {
  return createHmac("sha256", env().RATE_LIMIT_SECRET).update(value).digest("base64url").slice(0, 32);
}

/**
 * Limite por janela fixa persistido no banco (funciona com várias instâncias
 * serverless). Retorna true se a requisição é permitida.
 */
export async function rateLimit(scope: string, identifier: string, limit: number, windowSeconds: number) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("consume_rate_limit", {
    p_key: `${scope}:${hashKey(identifier)}`,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    // Falha no limitador não pode abrir a porteira: nega.
    return false;
  }
  return data === true;
}
