# Privacidade e proteção de dados

> Este documento e a página `/privacidade` são **modelos técnicos**. Eles não garantem conformidade legal.
> Bases legais, prazos, contratos com operadores e o texto final precisam ser definidos e aprovados pelo
> responsável pelo projeto com apoio jurídico antes do uso com clientes reais.

## Minimização

O sistema pede apenas: nome, tipo (adulto/criança), e-mail e/ou telefone de contato, nível técnico (opcional)
e, para crianças, o responsável e o parentesco. **Não** coleta CPF, endereço residencial, data de nascimento ou
dados de saúde de alunos. A chave Pix é do professor (recebedor). Observações administrativas trazem o alerta
"não registre dados sensíveis desnecessários".

## Crianças

Crianças não têm login. Apenas responsáveis vinculados pelo professor acessam os dados delas; o vínculo pode
ser revogado a qualquer momento, com efeito imediato.

## Onde os dados ficam

Supabase (banco, autenticação e arquivos) e Vercel (aplicação), mais o serviço de
antimalware escolhido. Recomenda-se região São Paulo e registrar esses provedores como operadores no aviso.

## Retenção configurável

| Dado | Regra atual |
| --- | --- |
| Arquivos de comprovantes | `proof_retention_days` por organização (mínimo 30 dias; vazio = manter). O job de arquivos apaga os de cobranças pagas há mais tempo; o pagamento permanece registrado |
| Contadores de tentativas | 2 dias |
| Histórico de jobs | 30 dias |
| Eventos internos já processados (outbox) | 90 dias |
| Auditoria | Mantida (imutável); definir prazo com o jurídico |
| Cadastro, aulas, financeiro | Enquanto houver vínculo + prazo legal a definir; depois, anonimização |

## Direitos dos titulares

- **Acesso e portabilidade**: aluno/responsável baixa os próprios dados em JSON pelo Perfil
  (`/api/exportar/<aluno>`), com limite de uso; o professor também pode exportar (auditado).
- **Pedidos** de acesso, correção, exportação e exclusão: abertos pelo Perfil, atendidos pelo professor em
  Configurações › Privacidade, com status e resolução registrados.
- **Exclusão**: anonimização pelo professor (auditada), que remove identificação, textos livres, vínculos e
  arquivos, preservando valores/datas financeiros sem identificação.

## Segurança aplicada

Ver [ARQUITETURA.md](ARQUITETURA.md) e [MATRIZ_DE_PERMISSOES.md](MATRIZ_DE_PERMISSOES.md): RLS forçado,
escrita só por funções auditadas, senhas fortes com limite de tentativas, cookies HttpOnly, CSP, arquivos privados com URL curta,
antimalware, auditoria imutável e logs sem dados sensíveis. Seeds, testes e capturas usam somente dados fictícios.

## Pendências para o responsável

- Nome do controlador e canal de contato (preencher em Configurações › Privacidade; aparecem no aviso).
- Bases legais por finalidade, prazos de retenção e de resposta a pedidos.
- Contratos/termos com os provedores (operadores) e registro de transferência internacional, se houver.
- Procedimento de comunicação de incidentes (ANPD e titulares).
- Revisão do texto de `/privacidade` e, se necessário, termo de consentimento do responsável para crianças.
