import { expect, type Page, type BrowserContext, type BrowserContextOptions, type TestInfo } from "@playwright/test";
import { Secret, TOTP } from "otpauth";
import { readFileSync } from "node:fs";

export type DemoCreds = { password: string; coach: { email: string; totp_secret: string }; adults: string[]; guardian: string };

export function creds(): DemoCreds {
  return JSON.parse(readFileSync(".demo-credentials.json", "utf8"));
}

const usedWindows = new Map<string, number>();
export async function totpCode(secret: string) {
  let w = Math.floor(Date.now() / 30000);
  if (usedWindows.get(secret) === w) {
    await new Promise((r) => setTimeout(r, 30000 - (Date.now() % 30000) + 300));
    w = Math.floor(Date.now() / 30000);
  }
  usedWindows.set(secret, w);
  return new TOTP({ secret: Secret.fromBase32(secret) }).generate();
}

export async function login(page: Page, email: string, password: string) {
  await page.goto("/entrar");
  await page.getByLabel(/^E-mail/).fill(email);
  await page.getByLabel(/^Senha/).fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

export async function loginCoach(page: Page) {
  const c = creds();
  await login(page, c.coach.email, c.password);
  await page.waitForURL(/\/mfa/);
  await page.getByLabel(/^Código de 6 dígitos/).fill(await totpCode(c.coach.totp_secret));
  await page.getByRole("button", { name: "Confirmar" }).click();
  await page.waitForURL(/\/professor/);
}

/** Coleta erros de console, exceções de página e violações de CSP. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror [${page.url()}]: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console [${page.url()}] ${m.location().url}: ${m.text()}`);
  });
  return errors;
}

export async function expectNoSecretsInStorage(context: BrowserContext, page: Page) {
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(storage).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
  const cookies = await context.cookies();
  for (const c of cookies.filter((c) => c.name.startsWith("sb-"))) expect(c.httpOnly, c.name).toBe(true);
}

/** Sai pela tela "Mais" (o botão existe em todos os tamanhos de tela). */
export async function logout(page: Page, area: "app" | "professor" = "app") {
  await page.goto(`/${area}/mais`);
  await page.locator("main").getByRole("button", { name: "Sair" }).click();
  await page.waitForURL(/\/entrar/);
}

/** Consulta direta ao banco LOCAL (somente para preparar/verificar cenários de teste). */
export async function localSql<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const { default: pg } = await import("pg");
  const { testEnv } = await import("../helpers/env");
  const client = new pg.Client({ connectionString: testEnv().dbUrl });
  await client.connect();
  try {
    return (await client.query<T>(text, params)).rows;
  } finally {
    await client.end();
  }
}

/** Último código de 6 dígitos enviado ao e-mail (Mailpit local). */
export async function latestEmailCode(email: string, after = 0): Promise<string> {
  const { testEnv } = await import("../helpers/env");
  const base = testEnv().mailpitUrl;
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}&limit=5`);
    const body = (await res.json()) as { messages?: { ID: string; Created: string }[] };
    const msg = (body.messages ?? []).find((m) => new Date(m.Created).getTime() >= after);
    if (msg) {
      const full = (await (await fetch(`${base}/api/v1/message/${msg.ID}`)).json()) as { Text?: string; HTML?: string };
      const m = `${full.Text ?? ""} ${full.HTML ?? ""}`.match(/\b(\d{6})\b/);
      if (m) return m[1];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Nenhum código recebido para ${email}`);
}

/** Data de hoje (YYYY-MM-DD) no fuso da escola. */
export function todaySaoPaulo(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

/** Opções do projeto (viewport, dispositivo, idioma, fuso) para contextos extras. */
export function contextOptions(info: TestInfo): BrowserContextOptions {
  const u = info.project.use;
  return {
    baseURL: u.baseURL, viewport: u.viewport, userAgent: u.userAgent, deviceScaleFactor: u.deviceScaleFactor,
    isMobile: u.isMobile, hasTouch: u.hasTouch, locale: u.locale, timezoneId: u.timezoneId, colorScheme: u.colorScheme,
  };
}

/** Zera os contadores de tentativas do banco LOCAL (higiene entre cenários). */
export async function resetRateLimits() {
  await localSql("delete from private.rate_limits");
}

/** Último link de redefinição de senha enviado ao e-mail (Mailpit local). */
export async function latestEmailLink(email: string, after = 0): Promise<string> {
  const { testEnv } = await import("../helpers/env");
  const base = testEnv().mailpitUrl;
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}&limit=5`);
    const body = (await res.json()) as { messages?: { ID: string; Created: string }[] };
    const msg = (body.messages ?? []).find((m) => new Date(m.Created).getTime() >= after);
    if (msg) {
      const full = (await (await fetch(`${base}/api/v1/message/${msg.ID}`)).json()) as { HTML?: string };
      const m = (full.HTML ?? "").match(/href="([^"]+\/auth\/confirm[^"]+)"/);
      if (m) return m[1].replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Nenhum link recebido para ${email}`);
}
