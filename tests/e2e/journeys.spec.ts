import { expect, test, type Locator, type Page } from "@playwright/test";
import sharp from "sharp";
import { contextOptions, loginCoach, todaySaoPaulo, watchErrors, resetRateLimits } from "./helpers";

test.beforeEach(resetRateLimits);
test.describe.configure({ timeout: 300_000 });

const NEW_PASSWORD = "Aluno-E2E-2026-teste";

/**
 * Clica e espera a Server Action terminar. A mensagem de sucesso não serve de sinal: fica num cartão que sai da
 * tela quando a página atualiza, e o botão muda de nome enquanto a ação está pendente.
 */
async function clickAndWaitAction(page: Page, button: Locator) {
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && "next-action" in r.request().headers()),
    button.click(),
  ]);
}

/** Card (ancestral mais próximo) que contém o texto e um botão com o nome dado. */
function cardWith(page: Page, text: string, button: string) {
  return page.locator("main").getByText(text, { exact: false }).first()
    .locator(`xpath=ancestor::*[.//button[normalize-space()='${button}']][1]`);
}

test("jornada completa: cadastro, convite, pedido de vaga, aprovação, comprovante e baixa", async ({ page: coach, browser }, info) => {
  const suffix = `${info.project.name}-${Date.now().toString(36)}`;
  const name = `Aluno E2E ${suffix}`;
  const email = `e2e-${suffix}@demo.cstennis.test`;
  const coachErrors = watchErrors(coach);

  // 1. Professor cadastra o aluno e gera o convite.
  await loginCoach(coach);
  await coach.goto("/professor/alunos/novo");
  await coach.getByLabel(/^Nome completo/).fill(name);
  await coach.getByLabel(/^E-mail/).fill(email);
  await coach.getByLabel(/Gerar convite de acesso para o aluno/).check();
  await coach.getByRole("button", { name: "Cadastrar aluno" }).click();
  await expect(coach.getByText("Aluno cadastrado")).toBeVisible();
  const inviteUrl = await coach.locator("#invite-url").inputValue();
  expect(inviteUrl).toMatch(/\/convite#[A-Za-z0-9_-]{20,}$/);
  await coach.getByRole("link", { name: "Abrir ficha do aluno" }).click();
  await expect(coach.locator("h1")).toHaveText(name);
  const studentPath = new URL(coach.url()).pathname;

  // 2. Aluno ativa o convite em outro navegador criando a própria senha (sem e-mail).
  const studentCtx = await browser.newContext(contextOptions(info));
  const student = await studentCtx.newPage();
  const studentErrors = watchErrors(student);
  await student.goto(inviteUrl);
  await expect(student.getByText(/Você foi convidado/)).toBeVisible();
  await expect(student, "o token sai da barra de endereço").toHaveURL(/\/convite$/);
  await expect(student.getByText(email)).toBeVisible();
  await student.getByLabel(/^Senha/).fill(NEW_PASSWORD);
  await student.getByLabel(/^Repita a senha/).fill(NEW_PASSWORD);
  await student.getByRole("button", { name: "Criar senha e entrar" }).click();
  await student.waitForURL(/\/app$/);
  await expect(student.locator("h1").first()).toBeVisible();

  // 3. O mesmo link não funciona de novo (uso único), nem em outro navegador.
  const otherCtx = await browser.newContext(contextOptions(info));
  const other = await otherCtx.newPage();
  await other.goto(inviteUrl);
  await expect(other.getByText("Convite já utilizado")).toBeVisible();
  await otherCtx.close();

  // 4. Aluno pede uma vaga fixa; o pedido não reserva vaga.
  await student.goto("/app/horarios");
  const slot = student.locator("main ul").first().locator(":scope > li").first();
  await expect(slot).toBeVisible();
  await slot.getByText("Pedir esta vaga").click();
  await slot.getByRole("button", { name: "Enviar pedido" }).click();
  await expect(student.getByText(/Pedido enviado! O professor vai analisar/)).toBeVisible();
  await student.reload();
  await expect(student.getByText("Pedido enviado — aguardando o professor.").first()).toBeVisible();
  await expect(student.getByText("Aguardando").first()).toBeVisible();

  // 5. Professor aprova (revalida capacidade/conflitos no servidor).
  await coach.goto("/professor/pedidos");
  const request = cardWith(coach, name, "Aprovar");
  await clickAndWaitAction(coach, request.getByRole("button", { name: "Aprovar" }));
  await expect(coach.getByRole("listitem").filter({ hasText: name }).filter({ hasText: "Aprovado" })).toBeVisible();

  // 6. A aula aparece para o aluno.
  await student.goto("/app/aulas");
  await expect(student.getByText("Nenhuma aula", { exact: false })).toHaveCount(0);

  // 7. Professor cria uma cobrança avulsa com justificativa.
  await coach.goto(studentPath);
  await coach.getByRole("navigation", { name: "Seções do aluno" }).getByRole("link", { name: "Financeiro", exact: true }).click();
  await coach.getByText("Criar cobrança avulsa (com justificativa)").click();
  const invoiceForm = coach.locator("form").filter({ has: coach.getByRole("button", { name: "Criar cobrança" }) });
  await invoiceForm.getByLabel(/^Valor \(R\$\)/).fill("210,00");
  await invoiceForm.getByLabel(/^Vencimento/).fill(todaySaoPaulo(5));
  await invoiceForm.getByLabel(/^Justificativa/).fill("Cobrança de teste automatizado (fictícia)");
  await invoiceForm.getByRole("button", { name: "Criar cobrança" }).click();
  await expect(coach.getByText(/Cobrança criada/)).toBeVisible();

  // 8. Aluno vê o Pix e envia o comprovante (envio ≠ pagamento).
  await student.goto("/app/financeiro");
  await student.locator("main a[href^='/app/financeiro/']").first().click();
  await expect(student.getByText("1. Pague pelo Pix no app do seu banco")).toBeVisible();
  const png = await sharp({ create: { width: 320, height: 480, channels: 3, background: "#ffffff" } }).png().toBuffer();
  await student.locator("#proof-file").setInputFiles({ name: "comprovante-ficticio.png", mimeType: "image/png", buffer: png });
  await student.getByRole("button", { name: /Enviar comprovante/ }).click();
  // A mensagem de sucesso some quando a página atualiza para "em análise" (o formulário sai da tela).
  await expect(student.getByText(/Comprovante (enviado|recebido|em análise)/).first()).toBeVisible({ timeout: 30_000 });
  await expect(student.getByText("Pagamento confirmado pelo professor")).toHaveCount(0);

  // 9. Professor confere e aprova; o aluno vê a confirmação.
  await coach.goto("/professor/financeiro/comprovantes");
  const proof = cardWith(coach, name, "Aprovar: crédito conferido");
  await clickAndWaitAction(coach, proof.getByRole("button", { name: "Aprovar: crédito conferido" }));
  await student.reload();
  await expect(student.getByText("Pagamento confirmado pelo professor")).toBeVisible();

  expect(coachErrors, coachErrors.join("\n")).toEqual([]);
  expect(studentErrors, studentErrors.join("\n")).toEqual([]);
  await studentCtx.close();
});

test("chamada de uma aula passada é salva pelo professor", async ({ page }) => {
  const errors = watchErrors(page);
  await loginCoach(page);
  await page.goto(`/professor/agenda?visao=semana&data=${todaySaoPaulo(-7)}`);
  await page.locator("main a[href^='/professor/aulas/']").first().click();
  await expect(page.getByRole("heading", { name: "Chamada" })).toBeVisible();
  const first = page.locator("form fieldset").first();
  await first.getByText("Presente", { exact: true }).click();
  await page.getByRole("button", { name: "Salvar chamada" }).click();
  await expect(page.getByText("Chamada salva.")).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);
});

test("convite para e-mail que já tem conta pede a senha atual", async ({ page: coach, browser }, info) => {
  test.skip(info.project.name !== "desktop", "Independe do tamanho de tela.");
  const { createUser, PASSWORD } = await import("../helpers/db");
  const suffix = Date.now().toString(36);
  const email = `existente-${suffix}@demo.cstennis.test`;
  await createUser(email);

  await loginCoach(coach);
  await coach.goto("/professor/alunos/novo");
  await coach.getByLabel(/^Nome completo/).fill(`Aluno Existente ${suffix}`);
  await coach.getByLabel(/^E-mail/).fill(email);
  await coach.getByLabel(/Gerar convite de acesso para o aluno/).check();
  await coach.getByRole("button", { name: "Cadastrar aluno" }).click();
  const inviteUrl = await coach.locator("#invite-url").inputValue();

  const ctx = await browser.newContext(contextOptions(info));
  const student = await ctx.newPage();
  await student.goto(inviteUrl);
  await student.getByLabel(/^Senha/).fill("Qualquer-Senha-2026");
  await student.getByLabel(/^Repita a senha/).fill("Qualquer-Senha-2026");
  await student.getByRole("button", { name: "Criar senha e entrar" }).click();
  await expect(student.getByText(/Já existe uma conta com o e-mail/)).toBeVisible();
  await student.getByLabel(/^Senha/).fill("Errada-Senha-2026");
  await student.getByRole("button", { name: "Entrar e aceitar convite" }).click();
  await expect(student.getByText("Senha incorreta.")).toBeVisible();
  await student.getByLabel(/^Senha/).fill(PASSWORD);
  await student.getByRole("button", { name: "Entrar e aceitar convite" }).click();
  await student.waitForURL(/\/app$/);
  await ctx.close();
});
