# Acesso sem e-mail — desenho

Data: 27/09/2026 · Aprovado pelo usuário na conversa de implantação.

## Motivo

O projeto Supabase de produção está no plano Free, sem SMTP próprio. O envio embutido do Supabase só entrega
para membros da equipe da organização, tem limite de poucos e-mails por hora e, no Free, não permite trocar os
modelos de e-mail. Convite por código e "esqueci a senha" por e-mail não funcionariam para alunos. O usuário
decidiu remover o e-mail do fluxo de acesso.

## Decisões

- O aluno (ou responsável) cria a senha ao abrir o link de convite, sem código por e-mail.
- Recuperação de senha: o professor gera um **link de nova senha** na ficha do aluno/responsável e envia pelo
  WhatsApp. Validade **1 hora** (`auth.email.otp_expiry = 3600`), uso único; gerar outro invalida o anterior.
- Cada link de nova senha gerado é registrado em `audit_events` (`password_link.create`).
- Professor que esquecer a senha: o responsável técnico gera o link com `npm run coach:password-link`.

## Fluxos

### Convite

1. `/convite#<token>` → `previewInviteAction` (sem mudança de contrato, exceto `email` completo no lugar de
   `masked_email` quando o convite é válido — o link é secreto e o aluno precisa saber qual é o login).
2. Sem sessão: formulário "Crie sua senha" (senha + confirmação, regras de `passwordProblem`).
   `activateInviteAction(token, password, confirm)`:
   - valida token, limite por IP e por token;
   - e-mail vem de `invitation_email(token)` (nunca do cliente);
   - `admin.createUser({ email, password, email_confirm: true })`;
   - se o e-mail já tem conta (`email_exists`), responde `{ ok: false, data: { existingAccount: true } }` e a tela
     pede a senha atual;
   - `signInWithPassword` → `accept_invitation` (mesma função e mensagens de hoje) → `/app`.
3. Conta já existente: `loginAndAcceptInviteAction(token, password)` → `signInWithPassword` com o e-mail do convite
   → `accept_invitation`. Senha errada conta no limite de tentativas.
4. Sessão já aberta com o mesmo e-mail / outro e-mail: comportamento atual mantido.

Removidos: `sendInviteCodeAction`, `verifyInviteCodeAction`, a etapa de código na tela, a página `/definir-senha`
e o uso de `app_metadata.needs_password` (nada mais cria contas sem senha).

### Link de nova senha

- Nova RPC `public.authorize_password_link(p_kind invitation_kind, p_target_id uuid) returns uuid`
  (`security definer`, `search_path = ''`): usa `private.coach_student` / `private.coach_guardian` para autorizar,
  encontra a conta vinculada ativa (`student_user_links` sem `revoked_at` / `guardians.user_id`), falha com `CS409`
  se não houver acesso ativo, grava `private.audit(..., 'password_link.create', ...)` e devolve o `user_id`.
  `execute` só para `authenticated`.
- Server action `createPasswordLinkAction(kind, targetId)` (professor): chama a RPC com a sessão do professor,
  busca o e-mail da conta com o cliente admin (`getUserById`), `generateLink({ type: 'recovery', email })` e
  devolve `${APP_URL}/auth/confirm?token_hash=<hashed_token>&type=recovery` com a validade.
- O link cai na rota existente `/auth/confirm` → `/redefinir-senha` (sem mudança).
- UI: botão "Gerar link de nova senha" na ficha do aluno (resumo) e do responsável quando há acesso ativo;
  painel de link reaproveitando `InviteLinkPanel` com textos próprios.

### "Esqueci a senha"

`/recuperar-senha` vira página informativa: "Peça ao professor um link para criar uma nova senha". Mantém o aviso
`?erro=link` (link inválido/expirado → pedir novo ao professor). Remove `requestResetAction`.

### Professor

`scripts/coach-password-link.ts` (`npm run coach:password-link -- <email>`): gera o link de recuperação para uma
conta de professor existente, usando a chave de serviço, igual ao final de `bootstrap-coach.ts`.

## Fora do escopo

- Colunas/RPCs de código de convite (`codes_sent`, `invitation_email_for_code`) ficam no banco sem uso; remoção
  em migration futura se desejado.
- SMTP, modelos de e-mail e limites de sessão (plano Pro).

## Testes

- Integração: `authorize_password_link` (professor da própria organização ok e auditado; outra organização,
  aluno sem acesso, aluno/responsável chamando → negado); convite ativado com senha (conta nova e existente).
- E2E: jornada de convite sem código; página "esqueci a senha" informativa; professor gera link de nova senha e o
  aluno redefine.
- Suítes existentes (lint, tipos, unitários, integração, E2E) passando.
