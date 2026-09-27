import "server-only";
import { z } from "zod";

/**
 * Variáveis de ambiente do servidor. Nenhuma delas usa o prefixo NEXT_PUBLIC_:
 * o navegador não recebe URL/chaves do Supabase porque todo acesso a dados
 * passa pelo servidor (sessão em cookie HttpOnly).
 */
const schema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  APP_URL: z.url(),
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
  RATE_LIMIT_SECRET: z.string().min(32),
  CRON_SECRET: z.string().min(32).optional(),
  FILE_SCAN_PROVIDER: z.enum(["clamav", "none"]).default("none"),
  CLAMAV_HOST: z.string().optional(),
  CLAMAV_PORT: z.coerce.number().int().positive().optional(),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Configuração de ambiente inválida ou ausente: ${fields}`);
  }
  if (parsed.data.APP_ENV === "production" && !parsed.data.APP_URL.startsWith("https://")) {
    throw new Error("APP_URL precisa usar HTTPS em produção.");
  }
  cached = parsed.data;
  return cached;
}

export function isProduction() {
  return env().APP_ENV === "production";
}
