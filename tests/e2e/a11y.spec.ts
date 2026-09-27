import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { creds, login, loginCoach, resetRateLimits } from "./helpers";

test.describe.configure({ timeout: 300_000 });
test.beforeEach(resetRateLimits);

const THEMES = ["light", "dark"] as const;

async function setTheme(context: BrowserContext, page: Page, theme: (typeof THEMES)[number]) {
  await context.addCookies([{ name: "cs-theme", value: theme, url: new URL(page.url()).origin }]);
}

/** Roda o axe (WCAG 2.1 A/AA) e devolve as violações de forma legível. */
async function audit(page: Page, label: string) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return result.violations.map((v) => `${label}: [${v.impact}] ${v.id} — ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

async function auditAll(page: Page, context: BrowserContext, paths: string[]) {
  const problems: string[] = [];
  for (const theme of THEMES) {
    await setTheme(context, page, theme);
    for (const path of paths) {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.locator("h1").first()).toBeVisible();
      problems.push(...(await audit(page, `${theme} ${path}`)));
    }
  }
  return problems;
}

test("acessibilidade (axe WCAG 2.1 AA) nas telas públicas, claro e escuro", async ({ page, context }) => {
  await page.goto("/entrar");
  const problems = await auditAll(page, context, ["/entrar", "/recuperar-senha", "/privacidade"]);
  expect(problems, problems.join("\n")).toEqual([]);
});

test("acessibilidade nas telas do aluno e do responsável, claro e escuro", async ({ page, context }) => {
  const c = creds();
  await login(page, c.adults[0], c.password);
  await page.waitForURL(/\/app$/);
  await page.goto("/app/financeiro");
  const invoice = await page.locator("main a[href^='/app/financeiro/']").first().getAttribute("href");
  const problems = await auditAll(page, context, ["/app", "/app/aulas", "/app/horarios", "/app/financeiro", invoice!, "/app/frequencia",
    "/app/evolucao", "/app/jogos", "/app/jogos/novo", "/app/avisos", "/app/perfil", "/app/mais"]);
  expect(problems, problems.join("\n")).toEqual([]);
});

test("acessibilidade nas telas do professor, claro e escuro", async ({ page, context }) => {
  await loginCoach(page);
  await page.goto("/professor/alunos");
  const student = await page.getByRole("link", { name: /Ana Exemplo/ }).first().getAttribute("href");
  await page.goto("/professor/financeiro");
  const invoice = await page.locator("main a[href^='/professor/financeiro/cobrancas/']").first().getAttribute("href");
  const problems = await auditAll(page, context, ["/professor", "/professor/agenda", "/professor/agenda?visao=mes", "/professor/pedidos",
    "/professor/alunos", student!, `${student}?aba=financeiro`, "/professor/alunos/novo", "/professor/agenda/horarios/novo",
    "/professor/financeiro", "/professor/financeiro/comprovantes", invoice!, "/professor/configuracoes/pix",
    "/professor/configuracoes/restricoes", "/professor/locais", "/professor/evolucao"]);
  expect(problems, problems.join("\n")).toEqual([]);
});

test("login só com teclado: pular para o conteúdo, foco visível e envio por Enter", async ({ page }) => {
  const c = creds();
  await page.goto("/entrar");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Pular para o conteúdo" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Tab");
  const email = page.getByLabel(/^E-mail/);
  await expect(email).toBeFocused();
  const outline = await email.evaluate((el) => getComputedStyle(el).outlineStyle + " " + getComputedStyle(el).boxShadow);
  expect(outline, "foco visível no campo").not.toBe("none none");
  await page.keyboard.type(c.adults[0]);
  await page.keyboard.press("Tab");
  await expect(page.getByLabel(/^Senha/)).toBeFocused();
  await page.keyboard.type(c.password);
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/app$/);
  await expect(page.getByRole("heading", { name: /Olá, Ana/ })).toBeVisible();
});

test("alvos de toque com pelo menos 44px na navegação inferior (celular)", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "Somente no layout de celular.");
  const c = creds();
  await login(page, c.adults[0], c.password);
  await page.waitForURL(/\/app$/);
  const links = page.getByRole("navigation", { name: /Navegação inferior|Navegação principal/ }).filter({ visible: true }).getByRole("link");
  const count = await links.count();
  expect(count).toBeGreaterThan(2);
  for (let i = 0; i < count; i++) {
    const box = await links.nth(i).boundingBox();
    expect(box!.height, `link ${i}`).toBeGreaterThanOrEqual(44);
    expect(box!.width, `link ${i}`).toBeGreaterThanOrEqual(44);
  }
});
