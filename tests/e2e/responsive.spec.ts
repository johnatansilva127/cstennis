import { mkdirSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { creds, login, loginCoach, resetRateLimits } from "./helpers";

/**
 * Sem rolagem horizontal em celular (360px), tablet (768px) e desktop.
 * Com SCREENSHOTS=1, salva capturas (somente dados fictícios do seed) em docs/screenshots.
 */
test.describe.configure({ timeout: 300_000 });
test.beforeEach(resetRateLimits);

const SHOTS = process.env.SCREENSHOTS === "1";
const OUT = "docs/screenshots";

async function check(page: Page, context: BrowserContext, path: string, shot: string | null, device: string) {
  for (const theme of ["light", "dark"] as const) {
    await context.addCookies([{ name: "cs-theme", value: theme, url: new URL(page.url()).origin }]);
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${device} ${theme} ${path}: rolagem horizontal`).toBeLessThanOrEqual(0);
    if (SHOTS && shot) {
      mkdirSync(OUT, { recursive: true });
      await page.mouse.move(0, 0);
      await page.screenshot({ path: `${OUT}/${device}-${shot}-${theme}.png`, fullPage: false });
    }
  }
}

const VIEWPORTS = [
  { device: "celular", project: "mobile", viewport: null },
  { device: "tablet", project: "desktop", viewport: { width: 768, height: 1024 } },
  { device: "desktop", project: "desktop", viewport: null },
] as const;

for (const v of VIEWPORTS) {
  test(`aluno sem rolagem horizontal (${v.device})`, async ({ page, context }, info) => {
    test.skip(info.project.name !== v.project);
    if (v.viewport) await page.setViewportSize(v.viewport);
    const c = creds();
    await page.goto("/entrar");
    await check(page, context, "/entrar", v.device === "celular" ? "login" : null, v.device);
    await login(page, c.adults[0], c.password);
    await page.waitForURL(/\/app$/);
    await page.goto("/app/financeiro");
    const invoice = await page.locator("main a[href^='/app/financeiro/']").first().getAttribute("href");
    await check(page, context, "/app", "aluno-inicio", v.device);
    await check(page, context, invoice!, "aluno-pix", v.device);
    await check(page, context, "/app/horarios", "aluno-horarios", v.device);
    await check(page, context, "/app/evolucao", v.device === "celular" ? "aluno-evolucao" : null, v.device);
    await check(page, context, "/app/jogos/novo", null, v.device);
  });

  test(`professor sem rolagem horizontal (${v.device})`, async ({ page, context }, info) => {
    test.skip(info.project.name !== v.project);
    if (v.viewport) await page.setViewportSize(v.viewport);
    await loginCoach(page);
    await page.goto("/professor/alunos");
    const student = await page.getByRole("link", { name: /Ana Exemplo/ }).first().getAttribute("href");
    await check(page, context, "/professor", "professor-painel", v.device);
    await check(page, context, "/professor/agenda", "professor-agenda", v.device);
    await check(page, context, "/professor/agenda?visao=mes", null, v.device);
    await check(page, context, student!, "professor-ficha-aluno", v.device);
    await check(page, context, "/professor/financeiro/comprovantes", "professor-comprovantes", v.device);
    await check(page, context, "/professor/pedidos", null, v.device);
    await check(page, context, "/professor/alunos/novo", null, v.device);
  });
}
