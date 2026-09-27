import { existsSync } from "node:fs";
import pg from "pg";
import { testEnv } from "../helpers/env";

/**
 * Preparação do E2E: roda SOMENTE contra o ambiente local (Supabase CLI +
 * `next start` em localhost). Zera os contadores de limite de tentativas do
 * banco local para que várias execuções seguidas não fiquem bloqueadas — o
 * controle continua ativo e tem teste próprio (security.spec.ts).
 */
export default async function globalSetup() {
  const base = new URL(process.env.E2E_BASE_URL ?? "http://localhost:3000");
  if (!["localhost", "127.0.0.1"].includes(base.hostname)) {
    throw new Error(`Recusando rodar E2E contra ${base.hostname}: use apenas o ambiente local.`);
  }
  if (!existsSync(".demo-credentials.json")) {
    throw new Error("Rode `npm run seed:demo` antes do E2E (cria dados fictícios e .demo-credentials.json).");
  }
  const client = new pg.Client({ connectionString: testEnv().dbUrl });
  await client.connect();
  try {
    await client.query("delete from private.rate_limits");
  } finally {
    await client.end();
  }
}
