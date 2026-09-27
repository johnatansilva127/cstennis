# Operação, monitoramento e resposta a incidentes

## Monitoramento

| O que | Como | Alerta sugerido |
| --- | --- | --- |
| App no ar | Monitor externo em `GET /api/health` (resposta `{"ok":true}`, sem dados) | 2 falhas seguidas |
| Jobs (aulas, cobranças, avisos) | Tela **Configurações › Sistema** (`job_health()`): último resultado de `daily`/`frequent`, fila de avisos pendente/falha | Job sem sucesso há mais de 2 h; avisos com falha > 0 |
| Arquivos | Mesma tela: comprovantes aguardando verificação e uploads presos | Aguardando verificação por mais de 1 dia (antivírus fora do ar) |
| Crons da hospedagem | Logs de `/api/jobs/files` e `/api/jobs/daily` no Vercel | Resposta ≠ 200 |
| Erros do servidor | Logs do Vercel (JSON, sem dados sensíveis) e *Logs* do Supabase | Pico de 5xx |
| Segurança | *Advisors* do Supabase, auditoria (`audit_events`), aviso "Dados Pix alterados" | Qualquer alteração de Pix não reconhecida |

## Rotinas

- **Diária (automática)**: geração de aulas e cobranças, avisos de vencimento/atraso, mudanças de status
  agendadas, limpeza de limites e histórico (pg_cron, a cada hora, idempotente) e job de arquivos (Vercel Cron).
- **Semanal (professor)**: conferir comprovantes pendentes e chamadas não registradas (painel "Pendências").
- **Mensal (responsável técnico)**: revisar *Advisors*, atualizar dependências (`npm run audit:deps`, CI),
  conferir backups.
- **Trimestral**: teste de restauração ([BACKUP_E_RESTAURACAO.md](BACKUP_E_RESTAURACAO.md)) e revisão de acessos.

## Runbooks

### Professor perdeu o autenticador (TOTP)

1. Confirmar a identidade **fora do sistema** (contato conhecido, videochamada, etc.). Nunca por e-mail/mensagem
   vindos de endereço novo.
2. No painel do Supabase: *Authentication › Users* → usuário → remover o fator MFA (ou via API administrativa
   `auth.admin.mfa.deleteFactor`) e encerrar as sessões.
3. O professor entra com a senha e cadastra um novo autenticador (obrigatório).
4. Registrar data, quem autorizou e como a identidade foi verificada.

### Professor esqueceu a senha

"Esqueci a senha" na tela de entrada. Mesmo após redefinir, o acesso ao painel continua exigindo o TOTP.

### Aluno/responsável sem acesso

- Esqueceu a senha → "Esqueci a senha".
- Nunca ativou / convite expirou → professor gera **novo convite** na ficha do aluno (o anterior é cancelado).
- Trocou de e-mail → professor corrige o e-mail no cadastro e gera novo convite.

### Remover acesso de alguém (ex.: responsável que não deve mais acompanhar a criança)

Ficha do aluno › Resumo e acesso → revogar vínculo/acesso (com motivo). O efeito é imediato: telas, API e
avisos futuros. O histórico é preservado e auditado.

### Suspeita de conta comprometida

1. Revogar o acesso da conta (ou, para o professor, trocar a senha e remover sessões no painel do Supabase).
2. Verificar `audit_events` do período (quem fez o quê) e a tela de Pix (troca não reconhecida?).
3. Se a chave Pix foi trocada: restaurar a correta imediatamente (exige TOTP), avisar alunos por outro canal
   para conferirem o recebedor, e verificar pagamentos do período no extrato.
4. Registrar o incidente; avaliar comunicação à ANPD e aos titulares com o responsável jurídico.

### Arquivo infectado detectado

O sistema recusa o envio, apaga o objeto e avisa o pagador. Verificar se houve outros envios do mesmo usuário
e, se houver padrão, revogar o acesso e investigar.

### Vazamento de segredo

| Segredo | Ação |
| --- | --- |
| Chave de serviço do Supabase | Gerar nova chave secreta no painel, atualizar no Vercel, redeploy, revogar a antiga; revisar logs |
| `CRON_SECRET` | Gerar novo valor, atualizar no Vercel e redeploy |
| `RATE_LIMIT_SECRET` | Gerar novo valor e redeploy (zera os contadores; sem impacto para usuários) |
| Senha do banco | Redefinir no painel; atualizar onde for usada (CI de backup) |
| Credenciais SMTP | Trocar no provedor e no painel do Supabase |

Segredos ficam em cofre de senhas e nas variáveis da hospedagem — nunca no repositório, em chats ou em e-mails.

### Job falhando

Ver erro resumido em **Configurações › Sistema** e detalhes em `private.job_runs` (SQL Editor). Os jobs são
idempotentes: após corrigir a causa, disparar manualmente com
`curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/jobs/daily` (ou aguardar a próxima hora).

## Pedidos de titulares (LGPD)

Alunos e responsáveis abrem pedidos pelo **Perfil** (acesso, correção, exportação, exclusão); o professor
atende em **Configurações › Privacidade** e registra a resolução. Exportação gera JSON dos dados do aluno;
exclusão é feita por **anonimização** (remove nome, contatos, observações, textos livres, vínculos de acesso e os
arquivos de comprovantes; mantém valores e datas financeiros sem identificação), com MFA recente. Prazos e bases legais devem ser definidos pelo responsável jurídico ([PRIVACIDADE.md](PRIVACIDADE.md)).
