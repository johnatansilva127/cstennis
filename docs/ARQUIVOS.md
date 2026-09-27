# Política de arquivos (comprovantes de pagamento)

Comprovantes são o único tipo de arquivo enviado por usuários nesta versão.

## Regras

| Regra | Valor |
| --- | --- |
| Tipos aceitos | JPEG, PNG e PDF — decididos pela **assinatura real dos bytes**, não pelo nome nem pelo `Content-Type` |
| Tamanho máximo | 10 MB (checado no navegador, na RPC, no bucket e novamente no servidor após o upload) |
| Onde ficam | Bucket **privado** `payment-proofs` do Supabase Storage, caminho `proofs/<organização>/<uuid aleatório>` (sem nome original, sem dados pessoais no caminho) |
| Quem envia | Aluno ou responsável com vínculo ativo, para uma cobrança em aberto do aluno |
| Quem abre | O professor da organização e quem tem vínculo ativo com o aluno; ninguém mais |
| Como abre | `/api/arquivos/<id>` autoriza no banco e redireciona (303) para uma **URL assinada de 60 s** servida pelo domínio do Storage (isolado do app). PDFs vão como anexo. Respostas com `no-store` e `no-referrer` |
| Limites de uso | 10 envios/hora e 30/dia por usuário; 120 aberturas/hora por usuário; finalização limitada no servidor |
| Retenção | Configurável por organização (`proof_retention_days`, mínimo 30 dias, vazio = manter). O arquivo de comprovantes de cobranças pagas há mais tempo é apagado pelo job de arquivos; o registro do pagamento permanece |

## Fluxo

1. **Preparar** (`prepareUploadAction` → RPC `begin_payment_submission`): valida vínculo, estado da cobrança,
   tipo declarado e tamanho; cria o registro `file_objects` (`pending_upload`) e o envio (`uploading`); o servidor
   emite uma URL de upload assinada **de uso único para aquele caminho** (sem sobrescrever).
2. **Enviar**: o navegador envia direto ao Storage (evita o limite de corpo das funções da hospedagem) com barra
   de progresso.
3. **Finalizar** (`finalizeUploadAction`, somente servidor):
   - baixa o objeto com a chave de serviço e confere tamanho;
   - detecta o tipo pela assinatura e compara com o declarado e com a extensão;
   - **imagens**: decodificação completa com `sharp` (arquivo truncado/corrompido é recusado), limite de pixels
     e dimensões;
   - **PDFs**: cabeçalho e `%%EOF`, recusa PDF criptografado e conteúdo ativo (`/JavaScript`, `/JS`, `/Launch`,
     `/EmbeddedFile`, `/RichMedia`, `/XFA`, `/SubmitForm`, `/ImportData`), inclusive dentro de streams
     comprimidos (Flate), com limite de descompressão;
   - calcula SHA-256;
   - **antimalware**: envia ao clamd (`INSTREAM`).
4. **Resultado** (RPC `complete_payment_submission_upload`, só servidor):
   - `clean` → arquivo liberado, envio `received`, cobrança `under_review`, professor avisado;
   - `pending`/`error` (antivírus não configurado ou indisponível) → envio registrado, **arquivo em quarentena**:
     ninguém consegue abri-lo; o professor confere o crédito direto no banco; o job de arquivos tenta verificar de novo;
   - `infected` → envio recusado, objeto apagado, pagador avisado para enviar outro arquivo.
   Qualquer falha de validação apaga o objeto e marca o envio como falho, com mensagem clara ao usuário.
5. **Conferência**: enviar comprovante **não quita** a cobrança. O professor aprova (gera o pagamento, uma única
   vez) ou rejeita com motivo (o pagador pode reenviar).

## Job de arquivos (`/api/jobs/files`, diário)

Remove uploads órfãos (mais de 1 h em `pending_upload`), apaga objetos marcados como infectados, reenvia ao
antivírus os que ficaram `pending`/`error` e aplica a retenção. Resultado em JSON, sem conteúdo de arquivos.

## Limitações conhecidas

- As verificações de PDF são heurísticas de defesa em profundidade; não substituem o antivírus nem garantem
  ausência de todo conteúdo malicioso. Por isso PDFs são servidos como anexo e de outro domínio.
- O ClamAV precisa de hospedagem própria com atualização de assinaturas (`freshclam`). Sem ele, os comprovantes
  permanecem em quarentena (o sistema **não** declara o arquivo como verificado).
- Não há OCR nem conferência automática de valores: a baixa é sempre decisão do professor.
