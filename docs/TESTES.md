# Testes e evidências

Todos os testes rodam **somente no ambiente local** (Supabase CLI em `localhost`, dados fictícios). Os helpers
recusam qualquer URL que não seja `localhost`/`127.0.0.1`.

## Última execução completa (27/09/2026, após o acesso sem e-mail, a partir de banco recriado com `supabase db reset`)

| Etapa | Comando | Resultado |
| --- | --- | --- |
| Lint | `npm run lint` | sem erros |
| Tipos | `npm run typecheck` | sem erros |
| Unitários | `npm run test:unit` | **19/20** (7 arquivos; 1 pulado: o teste com EICAR exige o `clamd` local, que não estava rodando) |
| Integração (banco real, RLS, concorrência) | `npm run test:integration` | **56/56** (10 arquivos) |
| Build de produção | `npm run build` | ok |
| E2E (Chromium, celular 360 px e desktop 1366 px; tablet 768 px nos testes de layout) | `npm run test:e2e` | **35 aprovados**, 13 pulados de propósito (testes restritos a um tamanho de tela), 0 falhas |
| Dependências | `npm audit` / `npm audit --omit=dev` | 0 vulnerabilidades conhecidas |
| Restauração de backup | ver [BACKUP_E_RESTAURACAO.md](BACKUP_E_RESTAURACAO.md) | contagens idênticas |

Problemas reais encontrados e corrigidos pelos testes nesta rodada: contraste do botão primário em *hover* no
tema escuro (4,2:1 → 7,0:1), calendário mensal com papéis ARIA inválidos, CSP bloqueando o contêiner temporário
do streaming do React, cabeçalho `X-Powered-By` exposto, e registro parcial da chave Pix na auditoria (agora só
tipo e "chave alterada").

Na rodada do acesso sem e-mail: a função nova `authorize_password_link` nascia executável por visitantes
não logados (permissão padrão de funções novas) — corrigido com `revoke` na migration; e a jornada E2E conferia
mensagens de sucesso que somem quando a página atualiza (aprovação de pedido, envio e aprovação de comprovante),
falhando de forma intermitente — passou a conferir o resultado que permanece na tela.

## Critérios de aceite × evidências

| # | Critério | Onde está testado |
| --- | --- | --- |
| 1 | Convite de uso único, expirado, revogado, destinatário incorreto, aceitação concorrente | `tests/integration/invites.test.ts` (7 testes) · E2E `journeys.spec.ts` (a pessoa cria a senha no link, sem e-mail; e-mail que já tem conta pede a senha atual; link reaberto mostra "Convite já utilizado"; token some da barra de endereço) · link de nova senha: `password-link.test.ts` (4 testes: autorizado e auditado só para a própria organização) e E2E `security.spec.ts` (uso único; "Esqueci a senha" orienta a pedir ao professor) |
| 2 | Isolamento entre alunos (IDOR) | `access-isolation.test.ts` ("aluno A não acessa dados de B alterando IDs…", "só enxerga as próprias linhas") · E2E `security.spec.ts` (cobrança, arquivo e exportação de outro aluno) |
| 3 | Responsável só vê filhos vinculados; revogação | `access-isolation.test.ts` · E2E `security.spec.ts` (seleção de aluno forjada na URL é ignorada) |
| 4 | Irmão não é bloqueado pela pendência do outro | `access-isolation.test.ts` ("filho devedor não bloqueia o irmão") |
| 5 | Aluno não altera papel, mensalidade, presença, pagamento ou avaliação | `access-isolation.test.ts` (critério 5) · `security-catalog.test.ts` (só SELECT, nenhuma política de escrita) |
| 6 | Aprovações concorrentes da última vaga | `schedule.test.ts` (duas aprovações → uma matrícula; matrículas diretas concorrentes) |
| 7 | Conflitos de professor, quadra, aluno e deslocamento, inclusive recorrências futuras | `schedule.test.ts` (3 testes) |
| 8 | Edição de série preserva histórico, exceções e vigência | `schedule.test.ts` (critério 8) |
| 9 | Job de cobrança idempotente; fevereiro/29–31; fuso | `finance.test.ts` (3 testes) · `src/lib/dates.test.ts` |
| 10 | Upload ≠ pagamento; rejeição → reenvio; aprovação duplicada não duplica receita | `finance.test.ts` (critério 10) · E2E `journeys.spec.ts` (envio real, "pago" só após aprovação) |
| 11 | Estorno com trilha e recálculo | `finance.test.ts` (critério 11) |
| 12 | Restrições valem pela API sem impedir regularização; liberação temporária expira | `finance.test.ts` (critério 12) |
| 13 | Comprovantes privados; URL expira; arquivo falso/grande/em quarentena inacessível | `files.test.ts` (4 testes) · `src/lib/files/validate.test.ts` e `scan.test.ts` (EICAR no clamd real) · E2E `security.spec.ts` (URL assinada de outro domínio recusada após 60 s) |
| 14 | Avisos sem vazamento e sem duplicidade | `notifications.test.ts` (4 testes) |
| 15 | Logout e troca de usuário sem cache | E2E `security.spec.ts` (`Clear-Site-Data`, cookies removidos, "voltar" não reexibe dados, outro usuário não vê dados anteriores) |
| 16 | Números conferem com as fixtures (frequência, jogos, financeiro, placar) | `fixtures.test.ts` (4 testes) · `src/lib/tennis/score.test.ts` |
| 17 | 360 px, tablet e desktop; temas claro e escuro; teclado e rótulos | E2E `responsive.spec.ts` (sem rolagem horizontal nos dois temas), `a11y.spec.ts` (axe WCAG 2.1 AA em 31 telas × 2 temas, teclado, alvos ≥ 44 px), `smoke.spec.ts` (todas as telas sem erro de console/CSP) |
| 18 | Teste de restauração, documentação de segredos, auditoria de dependências | [BACKUP_E_RESTAURACAO.md](BACKUP_E_RESTAURACAO.md) (executado), [OPERACAO.md](OPERACAO.md) (rotação de segredos), `npm audit` 0 |

Também cobertos: MFA do professor (`aal1` sem acesso; step-up renova com novo TOTP e Pix exige MFA recente),
professor de outra organização sem acesso, anônimo sem privilégios, `search_path` fixo em funções
`SECURITY DEFINER`, esquema `private` não exposto, jobs agendados, limite de tentativas no login, recuperação de
senha por link de uso único, cabeçalhos de segurança, BR Code conferido com o exemplo do Manual do BCB.

## Como reproduzir

```bash
npm ci && npm run db:start && npm run env:local
docker run -d --name cstennis-clamav -p 127.0.0.1:3310:3310 clamav/clamav:stable   # opcional
npm run lint && npm run typecheck && npm run test:unit && npm run test:integration
npm run build && npm run seed:demo
npm run test:e2e          # sobe `next start` automaticamente se não houver servidor em :3000
```

A CI (`.github/workflows/ci.yml`) executa a mesma sequência em cada pull request.

## O que os testes não cobrem

Safari/iOS e Firefox, leitores de tela reais, carga, pentest externo, e qualquer ambiente de nuvem (não há
homologação/produção configurados). Ver [LIMITACOES.md](LIMITACOES.md).
