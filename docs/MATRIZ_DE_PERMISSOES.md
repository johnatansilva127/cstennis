# Matriz de permissões

Papéis: **Professor** (membro `coach` da organização, sempre com sessão `aal2`/TOTP), **Aluno** (adulto com
login vinculado ao próprio cadastro), **Responsável** (login vinculado a uma ou mais crianças) e **Anônimo**.
Crianças não têm login. A autorização é aplicada no banco (RLS + RPCs); a interface apenas reflete o que o banco
permite. Legenda: ✅ permitido · 👁 somente leitura · ❌ negado · 🔐 exige MFA recente (≤ 15 min).

## Recursos

| Recurso | Professor | Aluno (o próprio cadastro) | Responsável (crianças vinculadas) | Anônimo |
| --- | --- | --- | --- | --- |
| Cadastro de alunos, status, observações privadas | ✅ | 👁 dados básicos próprios (sem observações privadas) | 👁 dados básicos das crianças | ❌ |
| Responsáveis e vínculos (criar, vincular, revogar) | ✅ | ❌ | ❌ (vê o próprio cadastro) | ❌ |
| Convites (gerar, revogar) | ✅ | ❌ | ❌ | ❌ |
| Aceitar convite | — | ✅ só com o e-mail do convite + código | ✅ idem | Pré-visualização mascarada |
| Locais e quadras | ✅ | 👁 | 👁 | ❌ |
| Horários fixos (séries), agenda, indisponibilidade | ✅ | 👁 horários com vaga¹ | 👁 horários com vaga¹ | ❌ |
| Matrícula direta, encerrar matrícula | ✅ | ❌ | ❌ | ❌ |
| Pedido de vaga | Aprovar / recusar | Criar ¹ ², cancelar o próprio pendente | Criar ¹ ², cancelar | ❌ |
| Aulas e presença | ✅ marcar chamada, remarcar, cancelar | 👁 ¹ | 👁 ¹ | ❌ |
| Mensalidade (valor, vencimento), cobranças | ✅ | 👁 | 👁 | ❌ |
| Dados do Pix para pagar | ✅ alterar 🔐 | 👁 (sempre, mesmo com restrição) | 👁 (sempre) | ❌ |
| Comprovante de pagamento | Conferir, aprovar, rejeitar | Enviar, retirar o próprio envio pendente, ver o próprio arquivo | idem para as crianças | ❌ |
| Pagamento (baixa manual) | ✅ | 👁 | 👁 | ❌ |
| Estorno de pagamento | ✅ 🔐 | ❌ | ❌ | ❌ |
| Regras de inadimplência e liberação manual | ✅ | ❌ | ❌ | ❌ |
| Avaliações técnicas e metas | ✅ (rascunho, publicar, nota privada) | 👁 só publicadas / metas visíveis ¹ | 👁 idem ¹ | ❌ |
| Jogos | 👁 + comentar | Registrar, editar, apagar sem comentário do professor ¹ | idem ¹ | ❌ |
| Comentário do professor em jogo | ✅ | 👁 | 👁 | ❌ |
| Avisos | Os próprios | Os próprios (só de alunos vinculados) | Os próprios | ❌ |
| Perfil e tema | O próprio | O próprio | O próprio | ❌ |
| Pedido de privacidade (acesso, correção, exportação, exclusão) | Atender | Abrir para si | Abrir para as crianças | ❌ |
| Exportar dados do aluno | ✅ 🔐 | ✅ os próprios | ✅ das crianças | ❌ |
| Anonimizar aluno | ✅ 🔐 | ❌ | ❌ | ❌ |
| Auditoria, saúde do sistema, configurações | ✅ | ❌ | ❌ | ❌ |
| Jobs e rotinas internas | ❌ (somente servidor com `CRON_SECRET` / pg_cron) | ❌ | ❌ | ❌ |

¹ Bloqueado quando o aluno está no nível **restringir módulos** (inadimplência). Mensalidades, Pix, envio de
comprovante, avisos e perfil continuam acessíveis para permitir a regularização.
² Bloqueado também no nível **bloquear pedidos**.

## Restrições por inadimplência (por aluno, nunca por família)

| Nível | Efeito |
| --- | --- |
| `none` | Nenhum |
| `warn_only` | Aviso nas telas; nada bloqueado |
| `block_requests` | Novos pedidos de vaga recusados pela API (`CS423`) |
| `restrict_modules` | Além disso, aulas, horários, frequência, evolução e jogos recusados pela API e ocultos pelo RLS |

A regra vem da organização (ou de uma regra específica do aluno), com dias de carência. O professor pode
conceder **liberação temporária** (com motivo e validade; expira sozinha) ou **bloqueio manual**; tudo auditado.
Um irmão em dia não é afetado pela pendência de outro (restrição avaliada por aluno).

## Regras transversais

- **Professor sem TOTP** (`aal1`) não lê nem escreve nada da organização.
- **Professor de outra organização** não vê nada desta (testado).
- **IDs enviados pelo cliente** (aluno selecionado, cobrança, arquivo) são sempre revalidados contra vínculos
  ativos; vínculo revogado perde o acesso imediatamente, inclusive a avisos futuros.
- **Participantes não alteram** papel, mensalidade, presença, pagamento, avaliação ou comentário do professor
  (não há RPC para isso e as tabelas não aceitam escrita direta) — coberto por teste de integração.
- **Funções de servidor** (confirmação de upload, antivírus, limites de tentativa, pré-visualização de convite,
  jobs) só podem ser executadas com a chave de serviço, nunca pelo navegador.
- **Anônimo** não executa nenhuma função pública e não tem privilégio em nenhuma tabela (testado).
