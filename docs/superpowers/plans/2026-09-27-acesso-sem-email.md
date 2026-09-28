# Acesso sem e-mail — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar o e-mail do acesso: convite cria a senha direto no link e o professor gera links de nova senha.

**Architecture:** O link de convite (secreto, uso único) passa a ser a prova suficiente para criar a conta com senha.
Recuperação usa `auth.admin.generateLink({ type: 'recovery' })`, que não envia e-mail, autorizada e auditada pela nova
RPC `authorize_password_link`; o link cai na rota já existente `/auth/confirm` → `/redefinir-senha`.

**Tech Stack:** Next.js (App Router, Server Actions), Supabase (Postgres RPC `security definer`, Auth admin API),
Vitest (integração no Supabase local), Playwright (E2E).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-27-acesso-sem-email-design.md`.
- Validade do link de nova senha: **3600 s** (`auth.email.otp_expiry`).
- Senha: regras de `passwordProblem` em `src/lib/password.ts` (mínimo 10, letras e números).
- Funções `security definer` com `set search_path = ''`; `execute` concedido explicitamente; erros de negócio `CS4xx` em pt-BR.
- Textos da interface em português do Brasil. Testes só contra o Supabase local.
- Comandos rodam na raiz do repositório com o Supabase local no ar (`npm run db:start`) e `.env.local` gerado
  (`npm run env:local`); E2E exige `npm run seed:demo`.

---

### Task 1: RPC `authorize_password_link`

**Files:**
- Create: `supabase/migrations/20260927121300_password_link.sql`
- Create: `tests/integration/password-link.test.ts`
- Modify: `src/lib/database.types.ts` (regenerado)

**Interfaces:**
- Produces: `public.authorize_password_link(p_kind public.invitation_kind, p_target_id uuid) returns uuid` —
  devolve o `user_id` da conta vinculada; audita `password_link.create`; `CS409` sem acesso ativo; `CS404` sem permissão.

- [ ] **Step 1: Teste de integração (falhando)** — `tests/integration/password-link.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import {
  anonClient, createAdultStudent, createLinkedAdult, createLinkedChild, rpc, rpcError, setupOrg, sql, type Org,
} from "../helpers/db";

describe("Link de nova senha gerado pelo professor", () => {
  let org: Org;
  let other: Org;
  beforeAll(async () => {
    org = await setupOrg();
    other = await setupOrg();
  });

  it("autoriza aluno com acesso ativo e registra auditoria", async () => {
    const { studentId, session } = await createLinkedAdult(org);
    const userId = await rpc<string>(org.coach, "authorize_password_link", { p_kind: "student", p_target_id: studentId });
    expect(userId).toBe(session.userId);
    const audit = await sql<{ actor_role: string; diff: { user_id: string } }>(
      "select actor_role, diff from public.audit_events where action = 'password_link.create' and entity_id = $1", [studentId]);
    expect(audit).toEqual([{ actor_role: "coach", diff: { user_id: session.userId } }]);
  });

  it("autoriza responsável com acesso ativo", async () => {
    const { guardianId, session } = await createLinkedChild(org);
    expect(await rpc<string>(org.coach, "authorize_password_link", { p_kind: "guardian", p_target_id: guardianId }))
      .toBe(session!.userId);
  });

  it("recusa aluno sem acesso ativo", async () => {
    const { student_id } = await createAdultStudent(org);
    const err = await rpcError(org.coach, "authorize_password_link", { p_kind: "student", p_target_id: student_id });
    expect(err.code).toBe("CS409");
  });

  it("recusa outra organização, o próprio aluno e anônimo, sem auditar", async () => {
    const { studentId, session } = await createLinkedAdult(org);
    const args = { p_kind: "student", p_target_id: studentId };
    expect((await rpcError(other.coach, "authorize_password_link", args)).code).toBe("CS404");
    expect((await rpcError(session, "authorize_password_link", args)).code).toBe("CS404");
    expect((await rpcError(anonClient(), "authorize_password_link", args)).code).toBe("42501");
    const audit = await sql("select 1 from public.audit_events where action = 'password_link.create' and entity_id = $1", [studentId]);
    expect(audit).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run --project integration tests/integration/password-link.test.ts`
Expected: FAIL (`PGRST202`: função não encontrada).

- [ ] **Step 3: Migration** — `supabase/migrations/20260927121300_password_link.sql`:

```sql
-- =============================================================================
-- Link de nova senha gerado pelo professor (acesso sem e-mail).
-- A função autoriza e audita; o servidor gera o link com a chave de serviço.
-- =============================================================================
create or replace function public.authorize_password_link(p_kind public.invitation_kind, p_target_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.students;
  v_guardian public.guardians;
  v_user uuid;
begin
  if p_kind = 'student' then
    v_student := private.coach_student(p_target_id);
    select l.user_id into v_user
      from public.student_user_links l
     where l.student_id = p_target_id and l.revoked_at is null;
    if v_user is null then
      perform private.fail('CS409', 'Este aluno não tem acesso ativo.');
    end if;
    perform private.audit(v_student.organization_id, 'password_link.create', 'student', p_target_id, p_target_id,
      jsonb_build_object('user_id', v_user));
  else
    v_guardian := private.coach_guardian(p_target_id);
    v_user := v_guardian.user_id;
    if v_user is null then
      perform private.fail('CS409', 'Este responsável não tem acesso ativo.');
    end if;
    perform private.audit(v_guardian.organization_id, 'password_link.create', 'guardian', p_target_id, null,
      jsonb_build_object('user_id', v_user));
  end if;
  return v_user;
end;
$$;

grant execute on function public.authorize_password_link(public.invitation_kind, uuid) to authenticated;
```

- [ ] **Step 4: Aplicar localmente e ver passar**

Run: `npx supabase migration up --local && npx vitest run --project integration tests/integration/password-link.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Tipos e suíte de integração**

Run: `npm run db:types && npm run typecheck && npm run test:integration`
Expected: `authorize_password_link` presente em `src/lib/database.types.ts`; tudo passando (inclui `security-catalog`).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260927121300_password_link.sql tests/integration/password-link.test.ts src/lib/database.types.ts
git commit -m "RPC authorize_password_link: professor autoriza e audita link de nova senha"
```

---

### Task 2: "Gerar link de nova senha" nas fichas

**Files:**
- Modify: `src/app/professor/alunos/[id]/actions.ts` (nova `createPasswordLinkAction`)
- Modify: `src/components/invite-link.tsx` (prop `kind`)
- Modify: `src/components/generate-invite.tsx` (novo `PasswordLinkButton`)
- Modify: `src/app/professor/alunos/[id]/tab-resumo.tsx`, `src/app/professor/responsaveis/[id]/page.tsx`
- Modify: `tests/e2e/security.spec.ts` (troca o teste de recuperação por e-mail), `tests/e2e/helpers.ts` (remove `latestEmailLink`)

**Interfaces:**
- Consumes: RPC `authorize_password_link` (Task 1).
- Produces: `createPasswordLinkAction(kind: "student" | "guardian", targetId: string): Promise<ActionState<{ url: string; expires_at: string }>>`;
  `PasswordLinkButton({ action, who })`; `InviteLinkPanel({ url, expiresAt, who, kind?: "invite" | "password" })`
  (input `#invite-url` ou `#password-url`).

- [ ] **Step 1: E2E (falhando)** — em `tests/e2e/security.spec.ts`, trocar o import para
  `import { contextOptions, creds, localSql, login, loginCoach, resetRateLimits, watchErrors } from "./helpers";`
  e substituir o teste `"recuperação de senha: link por e-mail, uso único, e nova senha funciona"` por:

```ts
test("nova senha: professor gera link, aluno redefine; link é de uso único e auditado", async ({ page: coach, browser }, info) => {
  test.skip(info.project.name !== "desktop", "Independe do tamanho de tela.");
  const c = creds();
  const email = c.adults[2];
  const temporary = "Temporaria-E2E-2026";
  const [row] = await localSql<{ student_id: string }>(
    `select l.student_id from public.student_user_links l join auth.users u on u.id = l.user_id
      where lower(u.email) = lower($1) and l.revoked_at is null`, [email]);

  await loginCoach(coach);
  await coach.goto(`/professor/alunos/${row.student_id}`);
  await coach.getByRole("button", { name: "Gerar link de nova senha" }).click();
  const link = await coach.locator("#password-url").inputValue();
  expect(new URL(link).pathname).toBe("/auth/confirm");
  const audit = await localSql("select 1 from public.audit_events where action = 'password_link.create' and entity_id = $1", [row.student_id]);
  expect(audit.length).toBeGreaterThan(0);

  const ctx = await browser.newContext(contextOptions(info));
  const page = await ctx.newPage();
  await page.goto(link);
  await page.waitForURL(/\/redefinir-senha/);
  await page.getByLabel(/^Nova senha/).fill(temporary);
  await page.getByLabel(/^Repita a nova senha/).fill(temporary);
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await page.waitForURL(/\/app$/);

  // O mesmo link não funciona de novo.
  await ctx.clearCookies();
  await page.goto(link);
  await expect(page).toHaveURL(/\/recuperar-senha\?erro=link/);

  // Senha antiga deixou de valer; a nova funciona. Depois restaura a senha de demonstração.
  await login(page, email, c.password);
  await expect(page.getByRole("alert").filter({ hasText: /incorretos/ })).toBeVisible();
  await login(page, email, temporary);
  await page.waitForURL(/\/app$/);
  await page.goto("/app/perfil");
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Trocar senha" }) });
  await form.getByLabel(/^Nova senha/).fill(c.password);
  await form.getByLabel(/^Repita a nova senha/).fill(c.password);
  await form.getByRole("button", { name: "Trocar senha" }).click();
  await expect(page.getByText(/Senha alterada/)).toBeVisible();
  await ctx.close();
});
```

  Em `tests/e2e/helpers.ts`, apagar a função `latestEmailLink` (último bloco do arquivo).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx playwright test tests/e2e/security.spec.ts -g "nova senha" --project=desktop`
Expected: FAIL (botão "Gerar link de nova senha" não encontrado).

- [ ] **Step 3: Server action** — em `src/app/professor/alunos/[id]/actions.ts`, trocar
  `import type { ActionState } from "@/lib/errors";` por:

```ts
import { env } from "@/lib/env";
import { logServerError, type ActionState } from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
```

  e acrescentar logo após `revokeInviteAction`:

```ts
/** Validade do link de nova senha: espelha `auth.email.otp_expiry` em supabase/config.toml. */
const PASSWORD_LINK_SECONDS = 3600;

/**
 * Link de nova senha que o professor envia pelo WhatsApp (sem e-mail). A RPC autoriza e
 * audita; o link é gerado com a chave de serviço e mostrado uma única vez.
 */
export async function createPasswordLinkAction(
  kind: "student" | "guardian", targetId: string,
): Promise<ActionState<{ url: string; expires_at: string }>> {
  const auth = await runRpc<string>("coach", "authorize_password_link", { p_kind: kind, p_target_id: targetId });
  if (!auth.ok || !auth.data) return { ok: false, message: auth.message, redirectTo: auth.redirectTo };
  const admin = createSupabaseAdminClient();
  const { data: user, error: userError } = await admin.auth.admin.getUserById(auth.data);
  const email = user?.user?.email;
  if (userError || !email) {
    logServerError("password-link:user", userError);
    return { ok: false, message: "Não foi possível gerar o link agora." };
  }
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (error) {
    logServerError("password-link", error);
    return { ok: false, message: "Não foi possível gerar o link agora." };
  }
  return {
    ok: true,
    data: {
      url: `${env().APP_URL}/auth/confirm?token_hash=${link.properties.hashed_token}&type=recovery`,
      expires_at: new Date(Date.now() + PASSWORD_LINK_SECONDS * 1000).toISOString(),
    },
  };
}
```

- [ ] **Step 4: Painel com `kind`** — `src/components/invite-link.tsx` inteiro:

```tsx
"use client";

import { Share2 } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/status";
import { CopyButton } from "@/components/ui/copy-button";
import { buttonClasses } from "@/components/ui/button";

const TEXT = {
  invite: {
    inputId: "invite-url",
    label: "Link de convite",
    title: "Link de convite para",
    body: "Exige confirmação por código enviado ao e-mail cadastrado.",
    share: "Seu acesso ao CS Tennis:",
    warning: "Este link aparece só agora. Se perder, gere um novo convite (o anterior é cancelado).",
  },
  password: {
    inputId: "password-url",
    label: "Link de nova senha",
    title: "Link de nova senha para",
    body: "Ao abrir, a pessoa cria uma nova senha.",
    share: "Crie sua nova senha do CS Tennis:",
    warning: "Este link aparece só agora e dá acesso à conta até ser usado. Se perder, gere outro (o anterior deixa de valer).",
  },
};

/** Exibe um link de uso único (mostrado uma única vez; o servidor não guarda o link). */
export function InviteLinkPanel({ url, expiresAt, who, kind = "invite" }: {
  url: string; expiresAt: string; who: string; kind?: "invite" | "password";
}) {
  const t = TEXT[kind];
  const [shared, setShared] = useState(false);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  const expires = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })
    .format(new Date(expiresAt));
  return (
    <div className="space-y-3 rounded-2xl border border-primary/40 bg-info-bg p-4">
      <p className="font-semibold text-text">{t.title} {who}</p>
      <p className="text-sm text-muted">
        Envie este link manualmente (por exemplo, pelo WhatsApp). Ele vale até {expires} e só pode ser usado uma vez. {t.body}
      </p>
      <label htmlFor={t.inputId} className="sr-only">{t.label}</label>
      <input id={t.inputId} readOnly value={url} onFocus={(e) => e.currentTarget.select()}
        className="block w-full rounded-xl border border-border-strong bg-surface px-3 py-2 font-mono text-xs text-text" />
      <div className="flex flex-wrap gap-2">
        <CopyButton value={url} label="Copiar link" variant="primary" />
        {canShare ? (
          <button type="button" className={buttonClasses("secondary")}
            onClick={async () => {
              try {
                await navigator.share({ title: "CS Tennis", text: t.share, url });
                setShared(true);
              } catch {
                /* compartilhamento cancelado */
              }
            }}>
            <Share2 aria-hidden className="size-4" /> Compartilhar…
          </button>
        ) : null}
      </div>
      {shared ? <p role="status" className="text-sm text-success">Compartilhamento aberto no aparelho.</p> : null}
      <Alert tone="warning">{t.warning}</Alert>
    </div>
  );
}
```

- [ ] **Step 5: Botão** — em `src/components/generate-invite.tsx`, trocar o import de ícones por
  `import { KeyRound, UserPlus } from "lucide-react";` e acrescentar no fim do arquivo:

```tsx
export function PasswordLinkButton({ action, who }: {
  action: () => Promise<ActionState<{ url: string; expires_at: string }>>; who: string;
}) {
  const [result, setResult] = useState<ActionState<{ url: string; expires_at: string }> | null>(null);
  const [pending, start] = useTransition();
  if (result?.ok && result.data) {
    return <InviteLinkPanel kind="password" url={result.data.url} expiresAt={result.data.expires_at} who={who} />;
  }
  return (
    <div className="space-y-2">
      <button type="button" disabled={pending} className={buttonClasses("secondary")}
        onClick={() => start(async () => {
          try {
            setResult(await action());
          } catch {
            setResult({ ok: false, message: "Falha de conexão. Tente novamente." });
          }
        })}>
        <KeyRound aria-hidden className="size-4" /> {pending ? "Gerando…" : "Gerar link de nova senha"}
      </button>
      {result && !result.ok ? <Alert tone="danger">{result.message}</Alert> : null}
    </div>
  );
}
```

- [ ] **Step 6: Fichas**
  - `tab-resumo.tsx`: import `{ GenerateInviteButton, PasswordLinkButton }` de `@/components/generate-invite` e
    `createPasswordLinkAction` de `./actions`. No bloco `link.data` (aluno adulto com conta), entre o `StatusBadge` e o
    `Disclosure`: `<PasswordLinkButton action={createPasswordLinkAction.bind(null, "student", studentId)} who="o aluno" />`.
    No cartão de cada responsável, dentro de `<div className="flex flex-wrap gap-2">`, depois do botão de convite:
    `{g.guardians.user_id ? <PasswordLinkButton action={createPasswordLinkAction.bind(null, "guardian", g.guardians.id)} who={g.guardians.full_name} /> : null}`.
  - `responsaveis/[id]/page.tsx`: importar `PasswordLinkButton` e `createPasswordLinkAction`; no ramo `g.user_id` envolver
    em `<div className="space-y-3">` com
    `<PasswordLinkButton action={createPasswordLinkAction.bind(null, "guardian", id)} who={g.full_name} />` antes do `Disclosure`.

- [ ] **Step 7: Ver passar**

Run: `npm run lint && npm run typecheck && npx playwright test tests/e2e/security.spec.ts --project=desktop`
Expected: tudo verde.

- [ ] **Step 8: Commit** — `git add -A src tests && git commit -m "Professor gera link de nova senha na ficha (sem e-mail)"`

---

### Task 3: Convite sem código — o aluno cria a senha no link

**Files:**
- Modify: `src/app/(auth)/convite/actions.ts`, `src/app/(auth)/convite/invite-flow.tsx`
- Delete: `src/app/(auth)/definir-senha/page.tsx`
- Modify: `src/app/(auth)/redefinir-senha/actions.ts` (remove `needs_password`)
- Modify: `src/components/invite-link.tsx` (`TEXT.invite.body`)
- Modify: `tests/e2e/journeys.spec.ts`, `tests/e2e/helpers.ts`, `tests/helpers/env.ts`

**Interfaces:**
- Produces: `activateInviteAction(token, prev, fd)` e `loginAndAcceptInviteAction(token, prev, fd)` (formato de
  `ActionForm`); `activateInviteAction` responde `{ ok: true, data: { existingAccount: true } }` quando o e-mail já tem
  conta. `InvitePreview.email` (e-mail completo, só com convite válido).

- [ ] **Step 1: E2E (falhando)** — em `tests/e2e/journeys.spec.ts`: import sem `latestEmailCode`; o passo 2 vira:

```ts
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
```

  e, no fim do arquivo:

```ts
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
```

  Em `tests/e2e/helpers.ts`, apagar `latestEmailCode`; em `tests/helpers/env.ts`, remover o campo `mailpitUrl`
  (tipo, leitura de `TEST_MAILPIT_URL`/`MAILPIT_URL` e o valor no `cached`).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx playwright test tests/e2e/journeys.spec.ts --project=desktop`
Expected: FAIL (campo "Senha" não existe na tela do convite).

- [ ] **Step 3: Server actions** — `src/app/(auth)/convite/actions.ts`:
  - imports: remover `createSupabaseAnonClient`; acrescentar `import { passwordProblem } from "@/lib/password";` e
    `logServerError` (`import { logServerError, type ActionState } from "@/lib/errors";`).
  - `InvitePreview`: acrescentar `email?: string;` com o comentário `/** E-mail do convite (login); só quando válido. */`.
  - `previewInviteAction`: depois de `const preview = data as InvitePreview;`:

```ts
  if (preview.status === "valid") {
    const { data: email } = await admin.rpc("invitation_email", { p_token: token });
    preview.email = email ?? undefined;
  }
```

    e no ramo com sessão, trocar a busca de e-mail por
    `preview.session = { signedIn: true, matches: !!preview.email && preview.email === userEmail, email: userEmail };`.
  - Apagar `sendInviteCodeAction` e `verifyInviteCodeAction`.
  - `acceptWithSession`: remover `getUser`/`needsPassword`; retorno `{ ok: true, message: "Convite aceito!", redirectTo: "/app" }`.
  - Acrescentar:

```ts
const INVITE_GONE: ActionState = { ok: false, message: "Este convite não está mais válido." };

async function signInAndAccept(token: string, email: string, password: string): Promise<ActionState> {
  const supabase = await getSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, fieldErrors: { password: "Senha incorreta." } };
  return acceptWithSession(token);
}

/** Conta nova: o link secreto e de uso único é a prova do convite; a pessoa cria a senha aqui. */
export async function activateInviteAction(token: string, _: ActionState, fd: FormData): Promise<ActionState> {
  if (!TOKEN_RE.test(token)) return { ok: false, message: "Convite inválido." };
  const password = String(fd.get("password") ?? "");
  const problem = passwordProblem(password, String(fd.get("confirm") ?? ""));
  if (problem) return { ok: false, fieldErrors: { password: problem } };
  if (!(await rateLimit("invite:activate:ip", await clientIp(), 20, 3600)) || !(await rateLimit("invite:activate", token, 10, 900))) {
    return { ok: false, message: "Muitas tentativas. Aguarde alguns minutos." };
  }
  const admin = createSupabaseAdminClient();
  const { data: email } = await admin.rpc("invitation_email", { p_token: token });
  if (!email) return INVITE_GONE;
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error?.code === "email_exists") return { ok: true, data: { existingAccount: true } };
  if (error?.code === "weak_password") return { ok: false, fieldErrors: { password: "Senha fraca. Escolha outra." } };
  if (error) {
    logServerError("invite:activate", error);
    return { ok: false, message: "Não foi possível ativar o acesso agora. Tente de novo em instantes." };
  }
  return signInAndAccept(token, email, password);
}

/** E-mail que já tem conta: entra com a senha atual e aceita o convite. */
export async function loginAndAcceptInviteAction(token: string, _: ActionState, fd: FormData): Promise<ActionState> {
  if (!TOKEN_RE.test(token)) return { ok: false, message: "Convite inválido." };
  const password = String(fd.get("password") ?? "");
  if (!password) return { ok: false, fieldErrors: { password: "Digite sua senha." } };
  if (!(await rateLimit("invite:login:ip", await clientIp(), 20, 3600)) || !(await rateLimit("invite:login", token, 5, 900))) {
    return { ok: false, message: "Muitas tentativas. Aguarde alguns minutos." };
  }
  const { data: email } = await createSupabaseAdminClient().rpc("invitation_email", { p_token: token });
  if (!email) return INVITE_GONE;
  return signInAndAccept(token, email, password);
}
```

- [ ] **Step 4: Tela** — `src/app/(auth)/convite/invite-flow.tsx`:
  - imports: `Link` de `next/link`; `ActionForm, TextField` de `@/components/ui/form` (sai `FieldShell`); das actions:
    `acceptInviteSignedInAction, activateInviteAction, loginAndAcceptInviteAction, previewInviteAction, signOutForInviteAction, type InvitePreview`.
  - estado: `const [step, setStep] = useState<"create" | "login">("create");` e remover `code`/`setCode`.
  - parágrafo de abertura sem a frase "O convite é para o e-mail …".
  - trocar os ramos `step === "start"` e o formulário de código por:

```tsx
      ) : step === "create" ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Seu login será o e-mail <strong className="text-text">{preview.email}</strong>. Crie uma senha para entrar.
          </p>
          <ActionForm action={activateInviteAction.bind(null, token!)} submitLabel="Criar senha e entrar" pendingLabel="Ativando…"
            onSuccess={(s) => {
              if ((s.data as { existingAccount?: boolean } | undefined)?.existingAccount) setStep("login");
            }}>
            <TextField name="password" type="password" label="Senha" autoComplete="new-password" required
              hint="Mínimo de 10 caracteres, com letras e números." />
            <TextField name="confirm" type="password" label="Repita a senha" autoComplete="new-password" required />
          </ActionForm>
        </div>
      ) : (
        <div className="space-y-3">
          <Alert tone="info">
            Já existe uma conta com o e-mail {preview.email}. Digite a senha que você já usa para aceitar o convite.
          </Alert>
          <ActionForm action={loginAndAcceptInviteAction.bind(null, token!)} submitLabel="Entrar e aceitar convite" pendingLabel="Entrando…">
            <TextField name="password" type="password" label="Senha" autoComplete="current-password" required />
          </ActionForm>
          <Link href="/recuperar-senha" className="inline-flex min-h-11 items-center text-sm font-semibold text-link">Esqueci a senha</Link>
        </div>
      )}
```

- [ ] **Step 5: Limpeza**
  - Apagar `src/app/(auth)/definir-senha/page.tsx`.
  - `src/app/(auth)/redefinir-senha/actions.ts`: remover o comentário "Conta criada por convite…", a chamada
    `updateUserById(… needs_password …)` e o import `createSupabaseAdminClient`.
  - `src/components/invite-link.tsx`: `TEXT.invite.body = "Ao abrir, a pessoa cria a própria senha."`.

- [ ] **Step 6: Ver passar**

Run: `npm run lint && npm run typecheck && npx playwright test tests/e2e/journeys.spec.ts`
Expected: tudo verde (todos os projetos de tela).

- [ ] **Step 7: Commit** — `git add -A src tests && git commit -m "Convite sem código por e-mail: o aluno cria a senha no link"`

---

### Task 4: "Esqueci a senha" orienta a pedir o link ao professor

**Files:**
- Modify: `src/app/(auth)/recuperar-senha/page.tsx`
- Delete: `src/app/(auth)/recuperar-senha/actions.ts`
- Modify: `src/lib/supabase/admin.ts` (remove `createSupabaseAnonClient`, sem uso)
- Modify: `tests/e2e/security.spec.ts`

- [ ] **Step 1: E2E (falhando)** — acrescentar em `tests/e2e/security.spec.ts`:

```ts
test("esqueci a senha orienta a pedir o link ao professor", async ({ page }) => {
  await page.goto("/recuperar-senha");
  await expect(page.getByText(/Peça ao professor um link/)).toBeVisible();
  await expect(page.getByLabel(/^E-mail/)).toHaveCount(0);
  await page.goto("/recuperar-senha?erro=link");
  await expect(page.getByText(/inválido, já foi usado ou expirou/)).toBeVisible();
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx playwright test tests/e2e/security.spec.ts -g "esqueci" --project=desktop` → FAIL.

- [ ] **Step 3: Página** — `src/app/(auth)/recuperar-senha/page.tsx` inteiro:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/ui/auth-card";
import { Alert } from "@/components/ui/status";

export const metadata: Metadata = { title: "Recuperar senha" };

export default async function RecoverPage({ searchParams }: PageProps<"/recuperar-senha">) {
  const params = await searchParams;
  return (
    <AuthCard eyebrow="Acesso" title="Recuperar senha" footer={<Link href="/entrar" className="font-semibold text-white underline">Voltar para entrar</Link>}>
      {params.erro === "link" ? (
        <Alert tone="warning" className="mb-4">O link é inválido, já foi usado ou expirou. Peça um novo ao professor.</Alert>
      ) : null}
      <p className="text-sm text-muted">
        Peça ao professor um link para criar uma nova senha. Ele gera o link no app e envia para você (por exemplo, pelo
        WhatsApp). O link vale por 1 hora e só pode ser usado uma vez.
      </p>
      <p className="mt-3 text-sm text-muted">Se você é o professor, fale com o responsável técnico do sistema.</p>
    </AuthCard>
  );
}
```

  Apagar `recuperar-senha/actions.ts` e a função `createSupabaseAnonClient` de `src/lib/supabase/admin.ts`.

- [ ] **Step 4: Ver passar** — `npm run lint && npm run typecheck && npx playwright test tests/e2e/security.spec.ts tests/e2e/a11y.spec.ts`

- [ ] **Step 5: Commit** — `git add -A src tests && git commit -m "Esqueci a senha: orientação para pedir o link ao professor"`

---

### Task 5: Configuração do Auth e link de senha do professor

**Files:**
- Modify: `supabase/config.toml`; Delete: `supabase/templates/*.html`
- Create: `scripts/coach-password-link.ts`; Modify: `package.json`, `scripts/bootstrap-coach.ts`

- [ ] **Step 1: config.toml**
  - `[auth.email]`: `otp_expiry = 3600` (comentário: validade do link de nova senha).
  - Remover as três seções `[auth.email.template.*]` e a pasta `supabase/templates/` (sem e-mails de acesso; no plano
    Free o Supabase recusa modelos sem SMTP próprio).
  - No bloco de produção, acrescentar:

```toml
# Plano Free: limites de sessão são recurso do Pro. Ao migrar, remova este bloco (vale o [auth.sessions] acima).
[remotes.production.auth.sessions]
timebox = "0s"
inactivity_timeout = "0s"
```

- [ ] **Step 2: Conferir** — `npx supabase config diff` (projeto ligado): em `auth`, só `email.otp_expiry` e nenhuma
  diferença de `sessions` ou templates.

- [ ] **Step 3: Script** — `scripts/coach-password-link.ts`:

```ts
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
```

  `package.json`: `"coach:password-link": "tsx scripts/coach-password-link.ts",` depois de `coach:bootstrap`.
  `scripts/bootstrap-coach.ts`: "expira em 15 min"/"expira em 15 minutos" → "vale 1 hora" (cabeçalho e mensagem).

- [ ] **Step 4: Verificar** — `npx supabase stop && npm run db:start && npm run env:local && npm run seed:demo`, depois
  `npx tsx --env-file=.env.local scripts/coach-password-link.ts --email <e-mail do professor em .demo-credentials.json>`
  → imprime `http://localhost:3000/auth/confirm?token_hash=…&type=recovery`.

- [ ] **Step 5: Commit** — `git add -A supabase scripts package.json && git commit -m "Auth sem e-mail: link de senha de 1 hora, sem modelos; script para o professor"`

---

### Task 6: Documentação

**Files:** `README.md`, `docs/ARQUITETURA.md`, `docs/DECISOES.md`, `docs/LIMITACOES.md`, `docs/OPERACAO.md`,
`docs/PUBLICACAO.md`, `docs/CHECKLIST_HOMOLOGACAO.md`, `docs/SERVICOS_E_CUSTOS.md`, `docs/PRIVACIDADE.md`,
`docs/BACKUP_E_RESTAURACAO.md`, `docs/MATRIZ_DE_PERMISSOES.md`, `docs/TESTES.md`, `docs/PROXIMOS_PASSOS.md`

- [ ] **Step 1:** Trocar toda menção a SMTP/código por e-mail/"Esqueci a senha por e-mail" pelo fluxo novo:
  convite → aluno cria a senha no link; nova senha → professor gera link de 1 hora na ficha (auditado);
  professor → `npm run coach:password-link`. `DECISOES.md`: D5 passa a "token no fragmento, uso único; sem e-mail" e
  nova decisão registrando a troca (motivo: plano Free sem SMTP). `MATRIZ_DE_PERMISSOES.md`: linha "Gerar link de nova
  senha (aluno/responsável da própria organização)" = professor. `LIMITACOES.md`: plano Free (pausa após ~7 dias sem
  uso, sem limite de sessão, sem proteção contra senhas vazadas, sem backup diário). `TESTES.md`: novos totais.
  `PROXIMOS_PASSOS.md`: situação real (projeto `mejykeckbtomkbcpwcnp` na organização Cs Tennis, Free, conta do Chrome;
  migrations e Auth aplicados; faltam chaves na Vercel, deploy, professor, troca de segredos).
- [ ] **Step 2:** `grep -rniE "smtp|código (de 6|por e-mail|enviado)|mailpit" README.md docs` só retorna menções
  intencionais (ex.: histórico da decisão).
- [ ] **Step 3: Commit** — `git add -A README.md docs && git commit -m "Documentação: acesso sem e-mail e situação da implantação"`

---

### Task 7: Verificação completa e publicação

- [ ] **Step 1:** `npm run lint && npm run typecheck && npm run test:unit && npm run test:integration && npm run build && npm run test:e2e` — tudo verde.
- [ ] **Step 2:** `git push origin claude/tender-johnson-qpwm5m`.
- [ ] **Step 3 (produção, com confirmação do usuário):** `npx supabase db push --linked` (só a migration nova) e
  `config push` de Auth (`otp_expiry`), conferindo o diff antes.
- [ ] **Step 4:** Com as chaves na Vercel (usuário), novo deploy de produção e `/api/health` respondendo.
