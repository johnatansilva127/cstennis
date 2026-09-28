import { expect, test } from "@playwright/test";
import { creds, expectNoSecretsInStorage, login, loginCoach, logout, watchErrors, resetRateLimits } from "./helpers";

test.beforeEach(resetRateLimits);
test.describe.configure({ timeout: 180_000 });

const COACH_PAGES = [
  "/professor", "/professor/agenda", "/professor/agenda?visao=mes", "/professor/agenda?pendentes=1", "/professor/agenda/horarios",
  "/professor/agenda/horarios/novo", "/professor/alunos", "/professor/alunos?status=all", "/professor/alunos/novo", "/professor/pedidos",
  "/professor/financeiro", "/professor/financeiro/comprovantes", "/professor/evolucao", "/professor/jogos", "/professor/locais",
  "/professor/avisos", "/professor/responsaveis", "/professor/convites", "/professor/mais", "/professor/configuracoes",
  "/professor/configuracoes/pix", "/professor/configuracoes/restricoes", "/professor/configuracoes/organizacao",
  "/professor/configuracoes/privacidade", "/professor/configuracoes/sistema",
  "/professor/configuracoes/perfil",
];

const PARTICIPANT_PAGES = ["/app", "/app/aulas", "/app/horarios", "/app/financeiro", "/app/frequencia", "/app/evolucao", "/app/jogos",
  "/app/jogos/novo", "/app/avisos", "/app/perfil", "/app/mais"];

test("telas do professor carregam sem erros de console/CSP", async ({ page, context }) => {
  const errors = watchErrors(page);
  await loginCoach(page);
  for (const path of COACH_PAGES) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator("h1").first(), path).toBeVisible();
  }
  // Detalhes: primeiro aluno, primeira série, primeira aula, primeira cobrança.
  await page.goto("/professor/alunos");
  await page.getByRole("link", { name: /Ana Exemplo/ }).click();
  const tabs = page.getByRole("navigation", { name: "Seções do aluno" });
  for (const tab of ["Aulas", "Financeiro", "Presença", "Evolução", "Jogos", "Histórico", "Resumo e acesso"]) {
    await tabs.getByRole("link", { name: tab, exact: true }).click();
    await expect(page.locator("h1")).toHaveText("Ana Exemplo");
  }
  await page.goto("/professor/agenda/horarios");
  await page.locator("main ul a[href^='/professor/agenda/horarios/']").first().click();
  await expect(page.getByText("Alterar a partir de uma data")).toBeVisible();
  await page.goto("/professor/financeiro");
  await page.locator("main a[href^='/professor/financeiro/cobrancas/']").first().click();
  await expect(page.getByRole("heading", { name: "Pagamentos" })).toBeVisible();
  await expectNoSecretsInStorage(context, page);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("telas do aluno e do responsável carregam sem erros", async ({ page, context }) => {
  const c = creds();
  const errors = watchErrors(page);
  await login(page, c.adults[0], c.password);
  await page.waitForURL(/\/app/);
  for (const path of PARTICIPANT_PAGES) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator("h1").first(), path).toBeVisible();
  }
  await page.goto("/app/financeiro");
  await page.locator("main a[href^='/app/financeiro/']").first().click();
  await expect(page.getByText(/Pague pelo Pix|Comprovantes enviados|Pagamento confirmado/).first()).toBeVisible();
  await expectNoSecretsInStorage(context, page);
  await logout(page);
  await login(page, c.guardian, c.password);
  await page.waitForURL(/\/app/);
  for (const path of PARTICIPANT_PAGES) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
  }
  expect(errors, errors.join("\n")).toEqual([]);
});
