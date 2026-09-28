# Próximos passos: colocar o CS Tennis no ar

Documento de passagem entre sessões. Qualquer nova conversa deve **ler este arquivo inteiro antes de agir**.
Situação registrada em 28/09/2026.

## Onde estamos

| Item | Situação |
| --- | --- |
| Código, banco, testes e documentação | ✅ Prontos, com o **acesso sem e-mail** (ver abaixo). Resultado da última rodada em [TESTES.md](TESTES.md) |
| GitHub | ✅ `johnatansilva127/cstennis`, única branch `claude/tender-johnson-qpwm5m` (é a branch padrão e a de produção). Não existe `main` |
| Supabase | ✅ Projeto **`cstennis`**, ref **`mejykeckbtomkbcpwcnp`**, São Paulo, na organização **Cs Tennis** (`bqsgmypgopxzszvaeove`, **plano Free**), em **outra conta** Supabase (a que está logada no Chrome do usuário). O conector MCP do Supabase **não enxerga** essa conta; usar o CLI (`npx supabase login` já feito neste computador) |
| Banco de produção | ✅ 15 migrations aplicadas; 37 tabelas com RLS forçado, 2 jobs no pg_cron, bucket `payment-proofs` privado, advisors sem alerta crítico (os avisos de `SECURITY DEFINER` são do desenho, decisão D3) |
| Auth de produção | ✅ Cadastro público desligado, senha mínima de 10 com letras e números, Site URL e Redirect URL do app, link de nova senha de 1 hora. Sem SMTP e sem modelos de e-mail (não são usados) |
| Vercel | ✅ Projeto `cstennis-app` (`prj_yv8dFhzsfOm4wQD1bIwi0GwNtov1`, time `team_ECSBx6qOFJXVieuXDkEJgCqE`), domínio principal **https://cstennis.vercel.app** (`APP_URL`, usado nos links de convite e de nova senha); https://cstennis-app.vercel.app continua servindo o mesmo app. O Site URL do Supabase segue em `cstennis-app` (os fluxos não o usam). Variáveis completas em **Production** (as chaves do Supabase só em Production, não em Preview) |
| Conta do professor | ✅ Criada em 28/09/2026 com `scripts/bootstrap-coach.ts` (organização `CS Tennis`, fuso São Paulo). Acesso só com e-mail e senha (D18). O professor já entrou; Pix, locais, horários e alunos ainda vazios |

## Decisões do usuário

- Supabase na organização **Cs Tennis (Free)**, não na organização Pro `fpzzdbjzaeelighuyyrj`. Consequências: o projeto
  pausa após ~7 dias sem uso, não há limite de sessão, proteção contra senhas vazadas nem backup diário
  ([LIMITACOES.md](LIMITACOES.md)). Em 28/09/2026 o usuário decidiu **manter o plano Free**.
- Endereço `cstennis.vercel.app` passado do app antigo para o novo em 28/09/2026 (o usuário moveu o domínio no painel
  da Vercel; o app antigo segue em `ace-coach.vercel.app`).
- **Acesso sem e-mail** (decisão D17 em [DECISOES.md](DECISOES.md)): no link do convite a pessoa cria a senha; quem
  esquece a senha pede ao professor, que gera na ficha um **link de nova senha** (1 hora, uso único, auditado) e envia
  pelo WhatsApp. Professor que esquecer a senha: `npm run coach:password-link` (ver [OPERACAO.md](OPERACAO.md)).
  Desenho em `docs/superpowers/specs/2026-09-27-acesso-sem-email-design.md`.

## Não mexer

- Projeto Supabase **`rgta-tenis`** (dados reais de outro sistema) e demais projetos das duas contas.
- Projeto Vercel **`cstennis`** (`prj_51qDxOZlUc3n28SLTSJx8LvEKcRR`), o app antigo, publicado em `ace-coach.vercel.app` a
  partir de **outro repositório** (`johnatansilva127/ace-coach`).
- Não gravar segredos no repositório. Testes automatizados só no ambiente local.

## Como rodar os testes neste computador (Windows)

- O Docker Desktop às vezes não abre por arquivos de socket antigos que o Windows não deixa apagar. Solução usada:
  fechar o Docker e **renomear** `%LOCALAPPDATA%\Docker\run` e `%LOCALAPPDATA%\docker-secrets-engine`; ele recria.
- O comando `docker` do PATH é um atalho `.bat` que o CLI do Supabase não aceita. Antes dos comandos:
  `export PATH="/c/Users/John/AppData/Local/Programs/DockerDesktop/resources/bin:$PATH"` (Git Bash).
- No PowerShell, `npx` é bloqueado pela política de scripts: usar `npx.cmd`.

## O que falta

Legenda: 🧑 = só o usuário pode fazer · 🤖 = o Claude faz.

1. ✅ Versão com acesso sem e-mail publicada (28/09/2026); `/api/health` ok.
2. **Conta do professor** (criada):
   - ✅ Professor criou a senha e já entrou. 🧑 Falta cadastrar Pix, local e quadras, e horários.
   - Se o link expirar (1 hora): 🤖 `npm run coach:password-link -- --email <e-mail do professor>` com as variáveis de
     produção. A chave secreta vem do CLI **com `--reveal`** (`npx supabase projects api-keys --project-ref
     mejykeckbtomkbcpwcnp --reveal -o json`; sem `--reveal` ela vem mascarada e dá "Invalid API key"), passada ao
     script no mesmo comando, sem gravar em arquivo nem mostrar na tela.
3. 🧑 **Homologação**: seguir o [checklist](CHECKLIST_HOMOLOGACAO.md) com um aluno de teste (convite pelo WhatsApp,
   criar senha, gerar link de nova senha).
4. ✅ Segredos `RATE_LIMIT_SECRET` e `CRON_SECRET` trocados na Vercel em 28/09/2026 (valores gerados direto na área de
   transferência do usuário e colados por ele; ninguém os viu) e novo deploy feito.
5. ✅ Plano Free mantido. Os crons diários da Vercel (`/api/jobs/*`, 06:15 e 06:40 UTC) acessam o banco todo dia, o que
   deve evitar a pausa por inatividade (o Supabase não garante). Se pausar: restaurar no painel do Supabase.
6. ✅ `cstennis.vercel.app` aponta para o app novo e `APP_URL` foi trocado para ele (28/09/2026).

## Pendências de negócio (não bloqueiam o primeiro deploy)

- Antivírus: `FILE_SCAN_PROVIDER=none` deixa os comprovantes em quarentena (não abrem); pagamento funciona.
- Backup (o plano Free não tem backup diário): dump externo e cópia do Storage ([BACKUP_E_RESTAURACAO.md](BACKUP_E_RESTAURACAO.md)).
- Revisão jurídica do aviso de privacidade; logotipo oficial; testes em iPhone/Safari.

## Regras para a próxima sessão

- Desenvolver e enviar na branch `claude/tender-johnson-qpwm5m`; não abrir pull request sem pedido.
- Confirmar com o usuário antes de qualquer ação com custo ou irreversível na nuvem.
- Responder em português do Brasil, com passos simples (o usuário não é técnico em infraestrutura).
