# Serviços externos e custos

Os valores dependem de plano, câmbio e uso, e mudam com frequência; por isso **não** estão fixados aqui.
Consulte as páginas oficiais de preços antes de contratar e registre a decisão.

| Serviço | Para quê | Obrigatório para uso real? | O que muda o custo | Observações |
| --- | --- | --- | --- | --- |
| **Supabase** (projeto de produção + projeto de homologação) | Banco Postgres, autenticação, armazenamento de arquivos, pg_cron | Sim | Plano, tamanho do banco e do storage, tráfego, **PITR** (adicional), recursos de sessão e proteção de senha vazada (planos pagos) | O plano gratuito pausa projetos inativos e não tem backups adequados: não usar para dados reais |
| **Vercel** (ou outra hospedagem Node) | Aplicação Next.js, crons diários | Sim | Plano, execuções e tráfego | O plano Hobby é para uso pessoal e não comercial; uso comercial exige plano pago. Recursos de rede privada/IP fixo são pagos |
| **ClamAV (clamd) hospedado** | Antivírus dos comprovantes | Recomendado (sem ele os comprovantes ficam em quarentena) | VM/contêiner com ~2–3 GB de RAM para as assinaturas, rede privada | Software livre; o custo é a hospedagem e a manutenção (`freshclam`) |
| **Domínio** | Endereço do app e do e-mail | Sim | Registro anual | — |
| **Armazenamento externo de backup** | Dump lógico e cópia dos comprovantes, cifrados | Recomendado | Volume armazenado | Ver [BACKUP_E_RESTAURACAO.md](BACKUP_E_RESTAURACAO.md) |
| **Monitor de disponibilidade** | Verificar `/api/health` | Recomendado | Plano | Há opções gratuitas |
| **GitHub Actions** | CI | Opcional | Minutos de execução | Repositórios privados têm cota mensal |
| WhatsApp (Cloud API ou provedor) | Avisos por WhatsApp | Não (fora do escopo) | Por conversa/mensagem | Estrutura preparada, sem integração |

## Passos manuais que dependem de pessoas

1. Criar as contas/projetos acima em nome do responsável pelo negócio (não em conta pessoal de terceiros).
2. Configurar Supabase Auth ([PUBLICACAO.md](PUBLICACAO.md)).
3. Hospedar o ClamAV em rede privada.
4. Provisionar o professor e cadastrar o Pix.
5. Aprovar o aviso de privacidade com apoio jurídico.
6. Fornecer o arquivo do logotipo oficial (SVG/PNG) para substituir a marca textual provisória.
7. Rodar o checklist de homologação e aprovar a publicação.
