# Próximos passos: colocar o CS Tennis no ar

Documento de passagem entre sessões. Qualquer nova conversa deve **ler este arquivo inteiro antes de agir**.
Situação registrada em 27/09/2026.

## Onde estamos

| Item | Situação |
| --- | --- |
| Código, banco (migrations), testes e documentação | ✅ Prontos. Lint, tipos, 20 unitários, 52 de integração e 32 E2E passando localmente ([TESTES.md](TESTES.md)) |
| GitHub | ✅ Repositório `johnatansilva127/cstennis`, única branch `claude/tender-johnson-qpwm5m` (é a branch padrão). Não existe `main` |
| Vercel | ✅ Projeto novo **`cstennis-app`** (`prj_yv8dFhzsfOm4wQD1bIwi0GwNtov1`, time `team_ECSBx6qOFJXVieuXDkEJgCqE`), ligado ao repositório, Node 22, domínio **https://cstennis-app.vercel.app**. Ainda **sem deploy** |
| Variáveis na Vercel | ✅ `RATE_LIMIT_SECRET`, `CRON_SECRET` (sensitive), `APP_URL=https://cstennis-app.vercel.app`, `APP_ENV` (production/staging), `FILE_SCAN_PROVIDER=none`. ❌ Faltam `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Supabase | ❌ Projeto `cstennis` **ainda não existe**. Organização `fpzzdbjzaeelighuyyrj` (plano Pro) |
| Login/e-mail (Auth, SMTP) | ❌ Não configurados |
| Conta do professor | ❌ Não criada |

## Decisões já tomadas pelo usuário

- Criar **um** projeto Supabase novo chamado `cstennis`, região **sa-east-1 (São Paulo)**, na organização acima.
- E-mails de acesso (código do convite e redefinição de senha) saem do **Gmail do usuário via senha de app** (SMTP).
- Configurações de Auth: preferência por o Claude aplicar (via CLI) em vez de cliques manuais, se a rede permitir.

## Não mexer

- Projeto Supabase **`rgta-tenis`** (dados reais de outro sistema) e demais projetos da organização.
- Projeto Vercel **`cstennis`** (`prj_51qDxOZlUc3n28SLTSJx8LvEKcRR`), que publica `cstennis.vercel.app` a partir de **outro repositório** (`johnatansilva127/ace-coach`). Trocar esse domínio para o app novo é decisão do usuário, só depois da homologação.
- Não gravar segredos no repositório. Testes automatizados só no ambiente local.

## Bloqueios encontrados na sessão anterior

1. O conector do Supabase (`create_project`) deu timeout 3 vezes sem criar nada. Antes de tentar de novo, **listar os
   projetos** para não duplicar.
2. A rede da sessão na nuvem bloqueia `supabase.com`, `api.supabase.com`, `*.supabase.co` e `*.vercel.app`, então o
   CLI do Supabase e testes diretos no site não funcionam. Para liberar: em claude.ai/code, botão do ambiente (ícone de
   nuvem acima da caixa de mensagem) → engrenagem → **Network access = Custom** → em *Allowed domains* colocar essas 4
   linhas → marcar **"Also include default list of common package managers"** → salvar.
3. Não há acesso ao navegador do usuário a partir da sessão na nuvem.

## Passo a passo do que falta

Legenda: 🧑 = só o usuário pode fazer · 🤖 = o Claude faz.

1. **Criar o projeto Supabase** `cstennis` em São Paulo.
   - 🧑 Painel: *New project* → nome `cstennis` → região South America (São Paulo) → *Generate* na senha (guardar) → criar.
   - 🤖 Alternativa com a rede liberada: `npx supabase login --no-browser` (o usuário abre o link no navegador e informa
     o código de verificação; o processo precisa receber o código pela entrada padrão) e
     `npx supabase projects create cstennis --org-id fpzzdbjzaeelighuyyrj --region sa-east-1 --db-password <gerada>`.
2. 🤖 **Aplicar as 13 migrations** de `supabase/migrations/`, em ordem de nome.
   - Pelo conector: `apply_migration` com o conteúdo de cada arquivo. Depois, alinhar o histórico com os arquivos do
     repositório para o CLI não reaplicar:
     `update supabase_migrations.schema_migrations set version = '<timestamp do arquivo>' where name = '<nome>';`
   - Ou pelo CLI (rede liberada): `npx supabase link --project-ref <ref>` e `npx supabase db push`.
   - Verificar: 37 tabelas em `public` com RLS forçado, `select jobname from cron.job` (2 jobs), bucket
     `payment-proofs` privado, `get_advisors` de segurança sem alertas críticos.
3. **Variáveis na Vercel** (projeto `cstennis-app`, Production e Preview).
   - 🤖 `SUPABASE_URL` (`get_project_url`) e `SUPABASE_PUBLISHABLE_KEY` (`get_publishable_keys`).
   - 🧑 `SUPABASE_SERVICE_ROLE_KEY`: copiar a chave *secret* em Project Settings › API Keys e colar na Vercel como
     *Sensitive* (o conector não lê chaves secretas). 🤖 Com o CLI logado: `npx supabase projects api-keys --project-ref <ref>`.
4. **Auth** no projeto novo (valores de `supabase/config.toml`; detalhes em [PUBLICACAO.md](PUBLICACAO.md)):
   cadastro público **desligado**, login anônimo desligado, e-mail com confirmação e troca segura, OTP de 6 dígitos com
   900 s, senha mínima de 10 caracteres com letras e números, proteção contra senhas vazadas, **Site URL**
   `https://cstennis-app.vercel.app`, **Redirect URL** `https://cstennis-app.vercel.app/auth/confirm`, templates de
   `supabase/templates/` (Magic Link = código; Reset Password = link), TOTP ligado, sessão 720 h / inatividade 168 h,
   limite de 60 e-mails por hora.
   - 🧑 Pelo painel, ou 🤖 com o CLI logado: `npx supabase config push` usando uma seção `[remotes]` que sobrescreva
     as URLs locais (revisar o diff antes de confirmar).
5. 🧑 **SMTP com Gmail**: criar a senha de app em https://myaccount.google.com/apppasswords (exige verificação em 2
   etapas) e preencher em Authentication › Emails › SMTP: host `smtp.gmail.com`, porta `465`, usuário e remetente =
   o endereço do Gmail, nome do remetente `CS Tennis`, senha = senha de app.
6. **Publicar**: 🤖 disparar um deploy de produção da branch `claude/tender-johnson-qpwm5m` (novo commit na branch ou
   `create_deployment` na Vercel) e conferir `/api/health` com `web_fetch_vercel_url`. Confirmar nas configurações do
   projeto qual é a *production branch*.
7. **Conta do professor**:
   - 🧑 Authentication › Users › *Add user* → *Create new user* com o e-mail do professor, senha temporária forte e
     *Auto Confirm User*. Informar ao Claude o e-mail usado.
   - 🤖 `select public.bootstrap_coach('CS Tennis', '<id do usuário>'::uuid, 'America/Sao_Paulo');` via `execute_sql`
     (pegar o id em `auth.users` pelo e-mail).
   - 🧑 Entrar em https://cstennis-app.vercel.app, configurar o autenticador (TOTP), trocar a senha e cadastrar o Pix.
8. **Teste real de e-mail**: gerar um convite para um e-mail de teste do próprio usuário e confirmar que o código chega;
   testar "Esqueci a senha".
9. 🤖 **Trocar os segredos** `RATE_LIMIT_SECRET` e `CRON_SECRET` na Vercel (gerar novos valores com
   `openssl rand -base64 48`). Os atuais apareceram no histórico da sessão anterior.

## Pendências de negócio (não bloqueiam o primeiro deploy)

- Antivírus: `FILE_SCAN_PROVIDER=none` deixa os comprovantes em quarentena (não abrem); pagamento funciona.
  Hospedar `clamd` em rede privada e trocar para `clamav` ([ARQUIVOS.md](ARQUIVOS.md)).
- Backup com PITR, dump externo e cópia do Storage ([BACKUP_E_RESTAURACAO.md](BACKUP_E_RESTAURACAO.md)).
- Revisão jurídica do aviso de privacidade; logotipo oficial; testes em iPhone/Safari;
  [checklist de homologação](CHECKLIST_HOMOLOGACAO.md). Ver também [LIMITACOES.md](LIMITACOES.md).

## Regras para a próxima sessão

- Desenvolver e enviar na branch `claude/tender-johnson-qpwm5m`; não abrir pull request sem pedido.
- Confirmar com o usuário antes de qualquer ação com custo ou irreversível na nuvem.
- Responder em português do Brasil, com passos simples (o usuário não é técnico em infraestrutura).
