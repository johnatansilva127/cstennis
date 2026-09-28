# Checklist de homologação

Executar em **homologação** (projeto Supabase e deploy próprios, dados fictícios) em pelo menos: um celular
Android (Chrome), um iPhone (Safari), um tablet e um computador, nos temas claro e escuro. Marcar data, aparelho
e quem executou. Nenhum dado real deve ser usado.

## Infraestrutura

- [ ] Migrations aplicadas (`supabase db push`) e `select jobname from cron.job` retorna os dois jobs
- [ ] Cadastro público desligado; Site URL e Redirect URL corretos
- [ ] TOTP habilitado; sessões com limite configurado (se o plano permitir)
- [ ] Variáveis de ambiente do Vercel preenchidas por ambiente; nenhum segredo com prefixo `NEXT_PUBLIC_`
- [ ] `https://<app>/api/health` responde; cabeçalhos: CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, `no-store`
- [ ] Crons do Vercel executando (logs 200) e tela Configurações › Sistema sem falhas
- [ ] ClamAV acessível só pela rede privada; upload limpo é liberado; arquivo EICAR é recusado
- [ ] Backup configurado e um teste de restauração registrado

## Professor

- [ ] Provisionamento pelo script; link de senha funciona uma vez; TOTP obrigatório no primeiro acesso
- [ ] Login pede TOTP; sem TOTP não há acesso a `/professor`
- [ ] Configurar Pix pede código TOTP; aviso "Dados Pix alterados" aparece; auditoria sem a chave
- [ ] Criar local e quadras; criar horários individual, dupla e grupo com capacidade
- [ ] Conflitos: mesmo horário/quadra, deslocamento entre locais e aluno em duas aulas são recusados com mensagem clara
- [ ] Cadastrar aluno adulto com mensalidade e horário; cadastrar criança com responsável novo e com responsável existente
- [ ] Gerar convite, copiar/compartilhar; gerar outro (o anterior deixa de valer); revogar
- [ ] Aprovar e recusar pedidos de vaga (recusa exige motivo); última vaga com dois pedidos
- [ ] Editar horário "a partir de" uma data: aulas passadas e presenças preservadas
- [ ] Remarcar e cancelar uma aula; registrar indisponibilidade; alunos recebem aviso
- [ ] Chamada: presente/falta/justificada/não informado; frequência do aluno atualiza
- [ ] Gerar cobranças; ajustar valor com justificativa; cobrança avulsa; cancelar cobrança
- [ ] Conferir comprovante: abrir arquivo, aprovar; rejeitar com motivo; baixa manual; estorno (pede TOTP)
- [ ] Regras de inadimplência: aviso, bloquear pedidos, restringir módulos, carência; liberação temporária expira sozinha
- [ ] Avaliação: rascunho não aparece ao aluno; publicar; "não avaliado" separado; metas
- [ ] Comentar jogo do aluno; aluno não edita o comentário
- [ ] Atender pedido de privacidade; exportar dados (pede TOTP); anonimizar aluno de teste
- [ ] Logout em computador compartilhado: voltar no navegador não mostra dados

## Aluno adulto

- [ ] Ativar acesso pelo convite (criar a senha no link); link não funciona de novo
- [ ] Início mostra a próxima aula em destaque; aulas e frequência corretas
- [ ] Pedir vaga em horário com vaga; cancelar pedido pendente
- [ ] Mensalidade: copiar chave Pix, QR Code (se habilitado), enviar comprovante JPEG/PNG/PDF até 10 MB
- [ ] Arquivo falso (ex.: .exe renomeado), acima de 10 MB ou PDF com JavaScript são recusados
- [ ] Envio não mostra "pago" antes da aprovação do professor; após rejeição é possível reenviar
- [ ] Com restrição: pedidos/módulos bloqueados com explicação, mas mensalidades e Pix acessíveis
- [ ] Registrar jogo (sets, tie-break, match tie-break, W.O., desistência); estatísticas coerentes
- [ ] Trocar tema (claro/escuro/sistema) e senha; exportar os próprios dados; abrir pedido de privacidade
- [ ] Nova senha: professor gera o link na ficha; vale 1 hora e só uma vez

## Responsável

- [ ] Ativar acesso pelo convite; ver as duas crianças e alternar entre elas
- [ ] Não consegue ver outro aluno trocando IDs na URL
- [ ] Pendência de um filho não bloqueia o irmão
- [ ] Após o professor revogar o vínculo, a criança some e avisos param

## Qualidade

- [ ] 360 px: sem rolagem horizontal, navegação inferior com alvos ≥ 44 px; tablet e desktop com barra lateral
- [ ] Navegação só por teclado com foco visível; leitor de tela (TalkBack/VoiceOver) anuncia rótulos e status
- [ ] Estados de carregando, vazio, erro, sucesso e sem permissão aparecem; duplo clique não duplica ações
- [ ] Queda de rede ao salvar: mensagem de erro e formulário preservado
- [ ] Movimento reduzido respeitado; contraste adequado nos dois temas
