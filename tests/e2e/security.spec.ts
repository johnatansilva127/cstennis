import { expect, test } from "@playwright/test";
import { creds, localSql, login, resetRateLimits, watchErrors } from "./helpers";

test.describe.configure({ timeout: 180_000 });
test.beforeEach(resetRateLimits);

async function anaFixtures() {
  const [ana] = await localSql<{ id: string }>("select id from public.students where full_name = 'Ana Exemplo' limit 1");
  const [inv] = await localSql<{ id: string }>("select id from public.invoices where student_id = $1 order by competence limit 1", [ana.id]);
  const [file] = await localSql<{ id: string }>(
    `select f.id from public.file_objects f join public.payment_submissions s on s.file_id = f.id
      join public.invoices i on i.id = s.invoice_id
     where i.student_id = $1 and f.status = 'stored' and f.scan_status = 'clean' limit 1`, [ana.id]);
  return { anaId: ana.id, invoiceId: inv.id, fileId: file?.id };
}

test("cabeçalhos de segurança, sem cache e sem anunciar o servidor", async ({ request }, info) => {
  test.skip(info.project.name !== "desktop", "Independe do tamanho de tela.");
  const res = await request.get("/entrar");
  const h = res.headers();
  const csp = h["content-security-policy"];
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(csp).not.toContain("'unsafe-inline'");
  expect(csp).toContain("object-src 'none'");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["cache-control"]).toContain("no-store");
  expect(h["x-powered-by"]).toBeUndefined();
  // Página do convite (token no fragmento) não envia Referer.
  expect((await request.get("/convite")).headers()["referrer-policy"]).toBe("no-referrer");
});

test("sem sessão, áreas privadas e arquivos exigem login", async ({ request }, info) => {
  test.skip(info.project.name !== "desktop", "Independe do tamanho de tela.");
  for (const path of ["/app", "/app/financeiro", "/professor", "/professor/alunos"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(307);
    expect(res.headers().location, path).toContain("/entrar?next=");
  }
  const { fileId } = await anaFixtures();
  const file = await request.get(`/api/arquivos/${fileId}`, { maxRedirects: 0 });
  expect(file.status()).toBe(401);
  const job = await request.post("/api/jobs/daily", { headers: { authorization: "Bearer errado" } });
  expect(job.status()).toBe(401);
});

test("logout limpa a sessão e a troca de usuário não mostra dados anteriores", async ({ page, context }) => {
  const c = creds();
  const errors = watchErrors(page);
  await login(page, c.adults[0], c.password);
  await page.waitForURL(/\/app$/);
  await expect(page.getByRole("heading", { name: /Olá, Ana/ })).toBeVisible();
  await page.goto("/app/financeiro");
  const invoiceHref = await page.locator("main a[href^='/app/financeiro/']").first().getAttribute("href");

  await page.goto("/app/mais");
  const [sair] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/auth/sair") && r.request().method() === "POST"),
    page.locator("main").getByRole("button", { name: "Sair" }).click(),
  ]);
  expect((await sair.allHeaders())["clear-site-data"]).toContain("cache");
  await page.waitForURL(/\/entrar/);
  expect((await context.cookies()).filter((k) => k.name.startsWith("sb-"))).toHaveLength(0);

  // Voltar no histórico não reexibe a página anterior (no-store + sessão encerrada).
  await page.goBack();
  await expect(page).toHaveURL(/\/entrar/);
  await expect(page.getByText("Ana Exemplo")).toHaveCount(0);
  await page.goto(invoiceHref!);
  await expect(page).toHaveURL(/\/entrar/);

  // Outro usuário no mesmo navegador.
  await login(page, c.adults[1], c.password);
  await page.waitForURL(/\/app$/);
  await expect(page.getByRole("heading", { name: /Olá, Bruno/ })).toBeVisible();
  for (const path of ["/app", "/app/financeiro", "/app/aulas", "/app/evolucao"]) {
    await page.goto(path);
    await expect(page.getByText("Ana Exemplo"), path).toHaveCount(0);
  }
  // Cobrança de outro aluno: estado "sem permissão", sem nenhum dado dela.
  await page.goto(invoiceHref!);
  await expect(page.getByText("Acesso não permitido")).toBeVisible();
  await expect(page.getByText("Pague pelo Pix")).toHaveCount(0);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("responsável só acessa os filhos vinculados; IDs de outros alunos são recusados", async ({ page }) => {
  const c = creds();
  const { anaId, invoiceId, fileId } = await anaFixtures();
  await login(page, c.guardian, c.password);
  await page.waitForURL(/\/app$/);
  await expect(page.getByText("Acompanhando Clara Fictícia").or(page.getByText("Acompanhando Davi Fictício"))).toBeVisible();

  // Seleção de aluno forjada na URL: o servidor ignora vínculo inexistente.
  await page.goto(`/app?aluno=${anaId}`);
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText("Ana Exemplo")).toHaveCount(0);

  await page.goto(`/app/financeiro/${invoiceId}`);
  await expect(page.getByText("Acesso não permitido")).toBeVisible();
  await expect(page.getByText("Pague pelo Pix")).toHaveCount(0);
  const file = await page.request.get(`/api/arquivos/${fileId}`, { maxRedirects: 0 });
  expect(file.status()).toBe(404);
  const exp = await page.request.get(`/api/exportar/${anaId}`, { maxRedirects: 0 });
  expect([403, 404]).toContain(exp.status());

  // Área do professor: participante é enviado de volta ao app.
  await page.goto("/professor/alunos");
  await expect(page).toHaveURL(/\/app$/);
});

test("comprovante: URL assinada curta, servida pelo storage, que expira", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Independe do tamanho de tela.");
  test.setTimeout(240_000);
  const c = creds();
  const { fileId } = await anaFixtures();
  await login(page, c.adults[0], c.password);
  await page.waitForURL(/\/app$/);
  const res = await page.request.get(`/api/arquivos/${fileId}`, { maxRedirects: 0 });
  expect(res.status()).toBe(303);
  expect(res.headers()["cache-control"]).toContain("no-store");
  const signed = res.headers().location;
  expect(signed).toMatch(/\/storage\/v1\/object\/sign\/.+token=/);
  expect(new URL(signed).origin, "arquivo servido fora do domínio do app").not.toBe(new URL(page.url()).origin);
  const ok = await page.request.get(signed);
  expect(ok.status()).toBe(200);
  expect(ok.headers()["content-type"]).toBe("image/png");
  // Validade de 60 s: depois disso a mesma URL é recusada.
  await page.waitForTimeout(65_000);
  const expired = await page.request.get(signed);
  expect(expired.status()).toBeGreaterThanOrEqual(400);
});

test("login: limite de tentativas bloqueia força bruta", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Independe do tamanho de tela.");
  const email = `bloqueio-${Date.now()}@demo.cstennis.test`;
  await page.goto("/entrar");
  let blocked = false;
  for (let i = 0; i < 12 && !blocked; i++) {
    await page.getByLabel(/^E-mail/).fill(email);
    await page.getByLabel(/^Senha/).fill(`senha-errada-${i}`);
    const answered = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/entrar"));
    await page.getByRole("button", { name: "Entrar" }).click();
    await answered;
    const alert = page.getByRole("alert").filter({ hasText: /incorretos|Muitas tentativas/ });
    await expect(alert).toBeVisible();
    blocked = (await alert.innerText()).includes("Muitas tentativas");
  }
  expect(blocked).toBe(true);
  await resetRateLimits();
});
