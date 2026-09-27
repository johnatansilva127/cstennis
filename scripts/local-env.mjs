#!/usr/bin/env node
// Gera .env.local para desenvolvimento a partir do Supabase LOCAL (CLI).
// Nunca use este script para produção: lá os segredos vêm do provedor.
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const out = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const vars = Object.fromEntries(
  out.split("\n").map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]),
);
if (!vars.API_URL?.includes("127.0.0.1") && !vars.API_URL?.includes("localhost")) {
  console.error("Supabase local não encontrado. Rode `npx supabase start`.");
  process.exit(1);
}
const previous = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "";
const keep = (name) => previous.match(new RegExp(`^${name}=(.+)$`, "m"))?.[1];
const lines = [
  "# Gerado por scripts/local-env.mjs — apenas desenvolvimento local.",
  `SUPABASE_URL=${vars.API_URL}`,
  `SUPABASE_PUBLISHABLE_KEY=${vars.ANON_KEY}`,
  `SUPABASE_SERVICE_ROLE_KEY=${vars.SERVICE_ROLE_KEY}`,
  "APP_URL=http://localhost:3000",
  "APP_ENV=development",
  `RATE_LIMIT_SECRET=${keep("RATE_LIMIT_SECRET") ?? randomBytes(32).toString("base64url")}`,
  `CRON_SECRET=${keep("CRON_SECRET") ?? randomBytes(32).toString("base64url")}`,
  `FILE_SCAN_PROVIDER=${keep("FILE_SCAN_PROVIDER") ?? "clamav"}`,
  "CLAMAV_HOST=127.0.0.1",
  "CLAMAV_PORT=3310",
];
writeFileSync(".env.local", lines.join("\n") + "\n", { mode: 0o600 });
console.log(".env.local gerado (Supabase local).");
