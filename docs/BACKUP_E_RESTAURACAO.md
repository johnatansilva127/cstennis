# Backup e restauração

## O que precisa de backup

| Item | Onde está | Coberto pelo backup do banco? |
| --- | --- | --- |
| Dados de negócio, auditoria, avisos | Postgres (`public`, `private`) | Sim |
| Usuários, fatores MFA, sessões | Postgres (`auth`) | Sim |
| Metadados dos arquivos | Postgres (`storage.objects`, `public.file_objects`) | Sim |
| **Conteúdo dos comprovantes** | Storage (objetos) | **Não** — backup separado |
| Agendamentos (pg_cron) | Postgres (`cron`) | Sim no backup gerenciado; no dump lógico recrie pela migration de jobs |
| Configuração de Auth (URLs, validade do link de senha, MFA) | Painel do Supabase | Não — manter documentada (ver [PUBLICACAO.md](PUBLICACAO.md)) |
| Variáveis de ambiente / segredos | Hospedagem (Vercel) e cofre de senhas | Não — guardar em cofre, nunca no repositório |

## Plano recomendado (a contratar/configurar)

1. **Backups gerenciados do Supabase**: diários nos planos pagos, com retenção conforme o plano. Para perder no
   máximo minutos de dados, contratar **PITR** (recuperação a um ponto no tempo), que é um adicional pago.
   O plano gratuito **não** oferece backups gerenciados adequados — não use para dados reais.
2. **Dump lógico próprio** (independência do provedor), diário, cifrado e guardado fora do provedor do banco:
   ```bash
   # Máquina/CI confiável, com a connection string do banco de produção (usuário com permissão de leitura).
   pg_dump "$PROD_DB_URL" -Fc -n public -n private -n auth -n storage -f cstennis-$(date +%F).dump
   gpg --symmetric --cipher-algo AES256 cstennis-$(date +%F).dump   # ou a ferramenta de cifra adotada
   ```
3. **Objetos do Storage**: sincronizar o bucket `payment-proofs` para armazenamento externo cifrado usando a
   API compatível com S3 do Supabase Storage (ex.: `rclone sync`), com a mesma retenção do dump.
4. **Retenção** sugerida: 7 diários + 4 semanais + 12 mensais, ajustada à política de privacidade
   (comprovantes apagados pela retenção não devem "voltar" por restauração além do necessário).
5. **Teste de restauração trimestral** (procedimento abaixo) em ambiente isolado, com registro do resultado.

Não versionar dumps: `.gitignore` já ignora `*.dump`, `*.sql.gz` e `/backups/`.

## Procedimento de restauração

### A. Restaurar o projeto gerenciado (incidente em produção)

1. Congelar escrita: colocar a hospedagem em modo manutenção (ou pausar o deploy) e desabilitar os crons.
2. No painel do Supabase: *Database › Backups* → escolher o backup diário ou o ponto no tempo (PITR) → restaurar.
   A restauração substitui o banco do projeto.
3. Conferir: contagens das tabelas principais, último pagamento/aviso esperado, `select * from cron.job`.
4. Conferir o Storage: objetos referenciados por `file_objects` com `status = 'stored'` existem no bucket;
   se faltarem, restaurar do backup de objetos.
5. Reativar crons e hospedagem; registrar o incidente em [OPERACAO.md](OPERACAO.md).

### B. Restaurar um dump lógico em um banco novo (migração de provedor ou teste)

```bash
createdb restore_test
psql -d restore_test -c "drop schema public cascade; create schema extensions;
  create extension btree_gist schema extensions; create extension pgcrypto schema extensions;
  create extension \"uuid-ossp\" schema extensions;"
pg_restore -d restore_test --exit-on-error cstennis-AAAA-MM-DD.dump
```

Em um projeto Supabase novo, os esquemas `auth` e `storage` já existem: restaure `public` e `private` com
`pg_restore -n public -n private` e migre usuários com as ferramentas de migração do Supabase; depois rode a
migration de jobs para recriar os agendamentos do pg_cron.

## Teste de restauração executado (ambiente local, dados fictícios)

Executado em 27/09/2026 no Supabase local (Postgres 17.6), com o banco usado pelos testes:

```bash
docker exec supabase_db_cstennis pg_dump -U supabase_admin -d postgres -Fc \
  -n public -n private -n auth -n storage -f /tmp/cstennis.dump          # 918 KB
# banco novo + extensões (como no procedimento B) e:
docker exec supabase_db_cstennis pg_restore -U supabase_admin -d restore_test --exit-on-error /tmp/cstennis.dump
```

Resultado: restauração sem erros (`exit=0`) e contagens idênticas entre origem e cópia:

| Verificação | Origem | Restaurado |
| --- | --- | --- |
| `students` | 47 | 47 |
| `invoices` | 34 | 34 |
| `payments` (soma em centavos) | 11 (260000) | 11 (260000) |
| `lesson_occurrences` | 298 | 298 |
| `attendance` | 9 | 9 |
| `audit_events` | 330 | 330 |
| `auth.users` | 47 | 47 |
| `storage.objects` (metadados) | 8 | 8 |
| Tabelas com RLS forçado / políticas | 37 / 37 | 37 / 37 |
| Função de negócio (`private.org_today`) | — | executa (2026-09-27) |

O banco temporário e o dump foram apagados ao final. Este teste valida o procedimento e a integridade do dump;
**não** substitui o teste periódico com o backup real de produção, que depende do projeto de produção existir.
