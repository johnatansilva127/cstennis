# Professor sem MFA — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Professor acessa e faz tudo só com e-mail e senha.

**Architecture:** Migration nova afrouxa `coach_org_ids()` e torna `require_recent_mfa()` no-op; o app deixa de
exigir `aal2` e remove as telas/campos de TOTP. Spec: `docs/superpowers/specs/2026-09-28-professor-sem-mfa-design.md`.

**Tech Stack:** Next.js, Supabase (Postgres/Auth), Vitest, Playwright.

## Global Constraints

- Migrations aplicadas não são editadas; mudança só em `supabase/migrations/20260928120000_coach_sem_mfa.sql`.
- Testes só no Supabase local (PATH com o `docker.exe` real, ver `docs/PROXIMOS_PASSOS.md`).

---

### Task 1: Banco sem MFA (TDD pelos testes de integração)

**Files:** Modify `tests/helpers/db.ts` (sem `enrollTotp`/`verifyTotp`/`freshTotp`), `git mv tests/integration/mfa-stepup.test.ts tests/integration/coach-access.test.ts`,
`tests/integration/finance.test.ts` (troca o teste de `has_recent_mfa`); Create `supabase/migrations/20260928120000_coach_sem_mfa.sql`.

- [ ] Step 1: `setupOrg` não chama `enrollTotp`; remover helpers de TOTP e o import de `otpauth`.
- [ ] Step 2: `coach-access.test.ts`: professor sem MFA (`aal1`) enxerga o próprio cadastro, troca Pix (auditoria sem a
  chave, aviso "Dados Pix alterados", chave inválida recusada) — mesmo conteúdo do teste antigo sem a parte de `amr`.
- [ ] Step 3: `finance.test.ts`: "step-up desativado: `require_recent_mfa()` não bloqueia sessão `aal1` sem `amr`".
- [ ] Step 4: `npm run test:integration` → FAIL (professor `aal1` sem acesso: `CS404`/listas vazias).
- [ ] Step 5: Migration:

```sql
create or replace function private.coach_org_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select m.organization_id from public.organization_memberships m
   where m.user_id = auth.uid() and m.role = 'coach' and m.status = 'active';
$$;

create or replace function private.require_recent_mfa()
returns void language plpgsql stable set search_path = '' as $$
begin
  return;
end;
$$;
```

- [ ] Step 6: `npx supabase migration up --local && npm run test:integration` → PASS. Commit.

### Task 2: App sem MFA

**Files:** `src/proxy.ts`, `src/app/page.tsx`, `src/lib/auth.ts`, `src/app/(auth)/entrar/{actions.ts,page.tsx}`,
`src/app/(auth)/redefinir-senha/actions.ts`, `src/app/professor/configuracoes/{actions.ts,page.tsx,pix/page.tsx}`,
`src/app/professor/financeiro/{actions.ts,cobrancas/[id]/page.tsx}`, `src/app/professor/alunos/[id]/{privacy-actions.ts,tab-historico.tsx}`,
`src/app/api/exportar/[studentId]/route.ts`, `src/lib/errors.ts`; Delete `src/lib/mfa.ts`, `src/app/(auth)/mfa/*`,
`src/app/professor/configuracoes/seguranca/page.tsx`.

- [ ] Step 1: E2E `loginCoach` sem código (espera `/professor` direto); `smoke.spec.ts` sem `/professor/configuracoes/seguranca`.
- [ ] Step 2: Rodar `security.spec.ts` → FAIL (redireciona para `/mfa`).
- [ ] Step 3: Remover checagens de `aal`, redirecionamentos para `/mfa`, `stepUpWithCode` e campos `mfa_code`.
- [ ] Step 4: `npm run lint && npm run typecheck && npm run build` e E2E completo a partir de banco recriado → PASS. Commit.

### Task 3: Scripts, dependência e docs

- [ ] `scripts/seed-demo.ts` sem TOTP; apagar `scripts/totp.ts` e o script `totp:demo`; `npm uninstall otpauth`;
  `scripts/bootstrap-coach.ts` sem a menção ao autenticador.
- [ ] Docs: D18 em `DECISOES.md` (D6 marcada como substituída), `ARQUITETURA`, `MATRIZ_DE_PERMISSOES`, `OPERACAO`,
  `PUBLICACAO`, `CHECKLIST_HOMOLOGACAO`, `LIMITACOES` (risco), `README`, `TESTES`, `PROXIMOS_PASSOS`. Commit.

### Task 4: Publicar

- [ ] `npx supabase db push --linked` (só a migration nova), `git push`, conferir `/api/health` e login do professor.
