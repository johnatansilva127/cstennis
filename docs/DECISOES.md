# Decisões técnicas e premissas

## Decisões

| # | Decisão | Motivo | Alternativa descartada |
| --- | --- | --- | --- |
| D1 | **Next.js (App Router) + Supabase** | O site atual já estava no Vercel; Supabase entrega Postgres com RLS, Auth com TOTP, Storage privado e pg_cron gerenciados, reduzindo peças a operar | API própria + banco + auth separados (mais superfície e custo de operação) |
| D2 | **Nenhum cliente Supabase no navegador**; sessão só em cookies HttpOnly geridos pelo servidor | Tokens inacessíveis a JavaScript (mitiga XSS), logout/troca de usuário controlados no servidor | `supabase-js` no navegador com tokens em `localStorage` (vetado no escopo) |
| D3 | **RLS só de leitura + escrita exclusivamente por RPCs `SECURITY DEFINER`** | Regras, autorização, concorrência, auditoria e outbox numa única transação; impossível contornar pela API | Escrita direta nas tabelas com políticas de INSERT/UPDATE (regras espalhadas, difícil garantir atomicidade) |
| D4 | Esquema **multi-organização** (`organization_id` em tudo, FKs compostas) mesmo com um professor | Isolamento testável e caminho aberto para outros professores sem migração estrutural | Esquema de um único inquilino |
| D5 | **Convite com token no fragmento da URL**, uso único; sem cadastro público | Token não vaza em logs/Referer; uso único, com validade e atômico; desde D17 o link secreto é a prova do convite | Cadastro aberto |
| D6 | **MFA TOTP obrigatório para o professor** e step-up (≤ 15 min) para Pix, estorno, exportação e anonimização | Conta do professor concentra dados e dinheiro | SMS (custo e ataques de troca de chip) |
| D7 | **Séries versionadas** com vigência e ocorrências materializadas (90 dias) | Editar "a partir de" sem reescrever o passado; exceções por aula; detecção de conflitos com dados concretos | Regra de recorrência calculada na leitura (difícil manter histórico e exceções) |
| D8 | **Centavos inteiros**, cobrança com snapshot do valor, geração idempotente | Sem erros de ponto flutuante; reajuste não altera cobranças passadas; job pode rodar várias vezes | Valores decimais recalculados |
| D9 | **Inadimplência calculada na hora** (não por job) | Regularização e liberação têm efeito imediato; nada depende do job ter rodado | Flag gravada por job (atrasos e inconsistência) |
| D10 | **Outbox transacional** para avisos, destinatários resolvidos no envio | Sem aviso "fantasma" de transação desfeita, sem duplicar, respeita vínculos revogados; pronto para outros canais | Inserir notificações direto na ação |
| D11 | **Upload direto ao Storage com URL assinada + finalização no servidor** | O limite de corpo das funções do Vercel (~4,5 MB) impede 10 MB via servidor; validação e antivírus continuam no servidor | Upload pelo servidor (não suporta 10 MB) |
| D12 | **ClamAV (clamd)** com quarentena por padrão | Software livre, padrão de mercado; sem verificação o arquivo não é liberado | Confiar só na extensão/MIME ou liberar sem verificação |
| D13 | **pg_cron** como agendador principal + Vercel Cron diário de redundância | Jobs perto dos dados e transacionais; redundância cobre pausa do cron do banco | Somente cron da hospedagem (plano gratuito limita frequência) |
| D14 | **CSP com nonce e `strict-dynamic`**, sem `unsafe-inline`; único hash liberado é `style="display:none"` usado pelo streaming do React | Mitiga XSS sem quebrar o framework | `unsafe-inline` para estilos |
| D15 | **Limite de tentativas no banco** (janela fixa, chave com HMAC) | Funciona com várias instâncias serverless; não guarda IP/e-mail em claro | Memória do processo (inútil em serverless) |
| D17 | **Acesso sem e-mail**: no convite a pessoa cria a senha; nova senha por link de 1 h gerado pelo professor na ficha (auditado) | Produção no plano Free do Supabase sem SMTP próprio: o envio embutido só entrega para a equipe, tem limite baixo e não permite trocar os modelos. Decisão do usuário em 27/09/2026 | Código por e-mail via SMTP (Gmail com senha de app ou serviço transacional) |
| D16 | Marca textual provisória "CS Tennis" | Não havia arquivo do logotipo (só captura de tela); não inventar nem usar a captura | Recriar o logotipo |

## Premissas (decisões de rotina tomadas sem consulta)

- Um professor por organização; aluno adulto tem login próprio; criança não tem login; um responsável pode ter
  várias crianças e uma criança pode ter mais de um responsável.
- E-mail é obrigatório para convite; telefone é opcional. Convite vale 48 h (configurável de 1 h a 30 dias).
- Pedido de vaga não reserva vaga; a aprovação revalida capacidade, conflitos e restrição (o professor pode
  aprovar mesmo com restrição, marcando a exceção, que fica auditada).
- Mensalidade: primeira cobrança integral (sem proporcionalidade); ajustes manuais com justificativa.
  Vencimento em 29–31 cai no último dia de meses menores. Cobrança gerada 10 dias antes do vencimento (configurável).
- Pagamento sempre do valor integral (sem pagamento parcial nesta versão); divergência → rejeitar com motivo.
- Atraso começa no dia seguinte ao vencimento, na data local; carência configurável por organização ou aluno.
- Chamada abre 30 min antes do início; "não informado" não vira falta; cancelamento não gera falta, crédito
  nem reposição (reposição/lista de espera estão fora do escopo).
- Deslocamento padrão de 30 min entre locais diferentes (configurável por organização e por horário).
- Lembrete de aula 24 h antes; aviso de vencimento 3 dias antes (configuráveis).
- Avaliação técnica com 8 fundamentos (forehand, backhand, saque, devolução, voleio, movimentação,
  consistência, tomada de decisão), notas 1–5; fundamento sem nota = "não avaliado" (não entra em médias).
- Jogos: formatos melhor de 3, melhor de 3 com match tie-break, melhor de 5, set único, pro set de 8, sets curtos
  e personalizado; estatísticas só com partidas concluídas.
- Fuso padrão America/Sao_Paulo; interface pt-BR; moeda BRL.
