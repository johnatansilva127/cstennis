/**
 * Link de nova senha para o PROFESSOR (no app ninguém acima dele gera esse link).
 *
 * Uso (em máquina confiável, com as variáveis do ambiente alvo):
 *   npx tsx --env-file=.env.production.local scripts/coach-password-link.ts --email professor@dominio.com
 *
 * Imprime UMA vez um link de uso único (vale 1 hora). Não envia e-mail.
 */
import { createClient } from "@supabase/supabase-js";

const i = process.argv.indexOf("--email");
const email = i > -1 ? process.argv[i + 1]?.toLowerCase() : undefined;
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.APP_URL;

if (!email || !url || !key || !appUrl) {
  console.error("Uso: --email <e-mail>, com SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e APP_URL definidos (use --env-file).");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function main() {
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: email! });
  if (error) throw error;
  console.log("\nLink de uso único para criar uma nova senha (não compartilhe; vale 1 hora):");
  console.log(`${appUrl}/auth/confirm?token_hash=${data.properties.hashed_token}&type=recovery\n`);
}

main().catch((e) => {
  console.error("Falha ao gerar o link:", e?.message ?? e);
  process.exit(1);
});
