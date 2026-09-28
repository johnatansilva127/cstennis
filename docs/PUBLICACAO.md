# Publicação, ambientes e rollback

> Nada foi publicado a partir deste trabalho. Os projetos de nuvem já existentes nas contas conectadas (Supabase
> e Vercel, incluindo um banco com dados de outro sistema) foram apenas identificados e **não foram alterados**; nenhum recurso
> pago foi criado. Os passos abaixo precisam ser executados por quem administra a infraestrutura.

## Ambientes

| Ambiente | Banco/Auth/Storage | App | Dados |
| --- | --- | --- | --- |
| Local | Supabase CLI (`npm run db:start`) | `npm run dev` | Fictícios (`seed:demo`) |
| Homologação (staging) | **Projeto Supabase próprio** | Vercel *Preview* (ou projeto separado) | Fictícios (`seed-demo.ts --allow-staging` com `APP_ENV=staging`) |
| Produção | **Projeto Supabase próprio** | Vercel *Production* | Reais |

Cada ambiente tem suas próprias chaves e segredos. Nunca reutilizar a chave de serviço, `CRON_SECRET` ou
`RATE_LIMIT_SECRET` entre ambientes. Testes automatizados recusam rodar fora de `localhost`.

## 1. Supabase (fazer para staging e depois para produção)

1. Criar o projeto na região **South America (São Paulo)**, senha do banco forte guardada em cofre.
2. Aplicar as migrations a partir de uma máquina confiável:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref-do-projeto>
   npx supabase db push          # mostra e aplica as migrations pendentes
   ```
   As migrations criam as extensões (`pgcrypto`, `btree_gist`, `pg_cron`), o bucket privado `payment-proofs`,
   as políticas RLS, as permissões e os agendamentos (`cstennis-daily`, `cstennis-frequent`).
3. **Authentication › Sign In / Providers**
   - Desligar *Allow new users to sign up* (não existe cadastro público).
   - E-mail habilitado; confirmar e-mail ligado; *Secure email change* ligado.
   - Senha: mínimo 10 caracteres, letras e números. Se o plano permitir, ligar a proteção contra senhas vazadas.
   - Validade do link de nova senha (`otp_expiry`): 3600 s.
4. **Authentication › URL Configuration**: *Site URL* = `APP_URL`; *Redirect URLs* = `APP_URL/auth/confirm`.
5. **E-mails**: o acesso não envia e-mails (no convite a pessoa cria a senha; nova senha por link gerado pelo
   professor). Não é preciso SMTP nem modelos de e-mail (decisão D17 em [DECISOES.md](DECISOES.md)).
6. **Authentication › Multi-Factor**: TOTP habilitado (verificação e cadastro).
7. **Authentication › Sessions** (recursos de plano pago): limite de sessão 30 dias e inatividade 7 dias, como
   no ambiente local. JWT de 1 hora com rotação de refresh token (padrão). No plano Free não existe; o bloco
   `[remotes.production.auth.sessions]` do `config.toml` evita que o `config push` tente aplicá-lo.
8. **Data API**: esquemas expostos somente `public` (e `graphql_public` se desejar); **nunca** `private`.
9. **Database**: exigir SSL; restringir acesso de rede ao banco se o plano permitir.
10. Conferir *Advisors › Security* sem alertas críticos e rodar no SQL Editor:
    `select jobname, schedule from cron.job;` (dois jobs).

Alternativa ao passo manual 3–8: `npx supabase config push` com uma seção `[remotes.<ambiente>]` no
`config.toml` sobrescrevendo URLs (o bloco `[remotes.production]` já existe para o projeto de produção). Revise o diff antes de confirmar — o arquivo local usa URLs de
`localhost`.

## 2. Antimalware (ClamAV)

O app fala o protocolo do `clamd` (TCP, sem autenticação). Ele **não pode ficar exposto na internet**.
Opções: hospedar o app e o `clamd` na mesma rede privada (plataforma de contêineres/VM), ou usar recursos de
rede privada/IP fixo da hospedagem com firewall. Manter `freshclam` atualizando as assinaturas.
Sem o serviço (`FILE_SCAN_PROVIDER=none` ou indisponível) o sistema continua funcionando, mas **os comprovantes
ficam em quarentena e não podem ser abertos**; o professor confere o crédito direto no banco.

## 3. Vercel

1. Importar o repositório (framework Next.js, Node 22). `vercel.json` define a região `gru1` (São Paulo) e os
   crons diários (`/api/jobs/files` e `/api/jobs/daily` como redundância do pg_cron).
2. Variáveis de ambiente (separadas para *Production* e *Preview*), conforme `.env.example`:
   `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (marcar como sensível), `APP_URL`
   (HTTPS), `APP_ENV`, `RATE_LIMIT_SECRET` e `CRON_SECRET` (32+ caracteres aleatórios cada), `FILE_SCAN_PROVIDER`,
   `CLAMAV_HOST`, `CLAMAV_PORT`. O Vercel envia `Authorization: Bearer $CRON_SECRET` nas chamadas de cron.
3. Domínio próprio com HTTPS. Com `APP_URL` em HTTPS o app envia HSTS, `upgrade-insecure-requests` e cookies `Secure`.
4. Proteção de *Preview Deployments* ligada (previews não devem ficar públicos).

## 4. Primeiro acesso

1. Provisionar o professor (`scripts/bootstrap-coach.ts`, ver README) a partir de máquina confiável.
2. Professor define a senha pelo link de uso único e configura o autenticador (TOTP).
3. Em **Configurações**: organização, Pix (exige confirmar o código TOTP), regras de inadimplência, retenção de
   comprovantes, controlador e contato de privacidade.
4. Revisar o aviso de privacidade com o responsável jurídico antes de convidar alunos.
5. Executar o [checklist de homologação](CHECKLIST_HOMOLOGACAO.md) em staging e depois, resumido, em produção.

## Fluxo de publicação

1. Pull request → CI (`.github/workflows/ci.yml`): lint, tipos, unitários, auditoria de dependências,
   integração no banco local, build e E2E.
2. Deploy de preview apontando para o Supabase de **staging** → homologação.
3. Antes de migrations em produção: confirmar backup recente (ou ponto de PITR) — ver
   [BACKUP_E_RESTAURACAO.md](BACKUP_E_RESTAURACAO.md).
4. `npx supabase db push` em produção **antes** do deploy do código que depende da migration. Migrations devem
   ser compatíveis com a versão anterior do app (expandir → migrar → contrair).
5. Merge na branch principal → deploy de produção → verificação: `/api/health`, login do professor, tela
   **Configurações › Sistema** (jobs recentes com sucesso, fila de avisos vazia).

## Rollback

- **Aplicação**: *Instant Rollback* no Vercel para o deploy anterior (sem rebuild). Como as migrations são
  compatíveis com a versão anterior, o rollback do app não exige mexer no banco.
- **Banco**: migrations são só "para frente". Para desfazer, criar uma migration corretiva e aplicá-la com
  `db push`. Em caso de dano a dados, restaurar backup/PITR conforme o runbook.
- **Configuração de Auth/segredos**: manter registro das alterações (data, quem, o quê) para reverter manualmente.
