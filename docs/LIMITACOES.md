# Limitações e pendências (honestas)

## Bloqueios para uso com clientes reais

Enquanto estes itens não forem resolvidos, **o sistema não deve ser considerado pronto para produção**:

1. **Implantação em andamento**: projeto Supabase de produção (`mejykeckbtomkbcpwcnp`) e projeto Vercel `cstennis-app`
   criados; ver [PROXIMOS_PASSOS.md](PROXIMOS_PASSOS.md). O endereço `cstennis.vercel.app` continua servindo a versão antiga.
2. **Plano Free do Supabase**: o projeto de produção pausa após ~7 dias sem uso e não tem limite de duração de
   sessão, proteção contra senhas vazadas nem backup diário. Para dados reais o recomendado é o plano Pro
   ([SERVICOS_E_CUSTOS.md](SERVICOS_E_CUSTOS.md)).
3. **Antimalware em produção**: o `clamd` precisa de hospedagem em rede privada com atualização de assinaturas.
   O protocolo não tem autenticação e não pode ficar exposto na internet; na Vercel isso exige recurso de rede
   privada/IP fixo (pago) ou hospedar o app junto do `clamd`. Sem isso, os comprovantes ficam em quarentena
   (fluxo de pagamento funciona, mas o arquivo não pode ser aberto).
4. **Backups**: plano pago com backups/PITR, dump lógico externo e cópia dos objetos do Storage ainda não
   contratados/automatizados. O procedimento foi testado apenas localmente.
5. **Aviso de privacidade**: modelo técnico; precisa de revisão jurídica, controlador, contato e bases legais.
6. **Recursos de sessão** (limite de 30 dias e inatividade de 7 dias) e **proteção contra senhas vazadas**
   dependem de plano pago do Supabase; no plano gratuito a sessão dura até o logout ou a revogação.

## Limitações funcionais (escopo desta versão)

- Avisos só dentro do app. Convites são enviados manualmente pelo professor (copiar/compartilhar link).
  WhatsApp e e-mail de avisos: estrutura preparada, **sem integração**.
- Pagamento só por Pix manual e sempre integral; sem cartão, boleto, pagamento parcial ou conciliação bancária
  automática. Não há OCR de comprovantes.
- Sem reposição de aulas, créditos, lista de espera, rankings ou vídeos (fora do escopo definido).
- Um único professor por organização; não há perfis de assistente/secretaria.
- Sem exportação contábil (CSV/planilha); o resumo financeiro é exibido na tela.
- Sem notificações push nem modo offline.

## Limitações técnicas conhecidas

- Testes E2E rodaram **somente no Chromium** (celular 360 px e desktop; tablet 768 px nos testes de layout).
  Safari (iOS) e Firefox não foram testados automaticamente — incluir no checklist manual.
- Acessibilidade verificada com axe (WCAG 2.1 A/AA), teclado e tamanho de alvos; **não** houve teste manual com
  leitores de tela.
- Não houve teste de carga nem pentest externo; os testes de segurança são do próprio projeto, no ambiente local.
- A inspeção de PDFs é heurística (defesa em profundidade); a proteção principal é antivírus + download isolado.
- O limite de tentativas por IP depende do cabeçalho de IP definido pela hospedagem (`x-real-ip`/`x-forwarded-for`);
  em hospedagens que não sobrescrevem esses cabeçalhos, o limite por IP pode ser contornado (o limite por
  e-mail/usuário continua valendo).
- A CSP libera, por hash, um único estilo inline (`display:none`) exigido pelo streaming do React.
- O Supabase não oferece códigos de recuperação de MFA: perda do autenticador exige o procedimento
  administrativo de [OPERACAO.md](OPERACAO.md).
- O logotipo oficial não foi fornecido; a marca textual é provisória.
- A auditoria é mantida indefinidamente até que um prazo de retenção seja definido.
