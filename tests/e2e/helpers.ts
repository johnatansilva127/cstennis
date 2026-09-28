import { expect, type Page, type BrowserContext, type BrowserContextOptions, type TestInfo } from "@playwright/test";
import { readFileSync } from "node:fs";

export type DemoCreds = { password: string; coach: { email: string }; adults: string[]; guardian: string };

export function creds(): DemoCreds {
  return JSON.parse(readFileSync(".demo-credentials.json", "utf8"));
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
