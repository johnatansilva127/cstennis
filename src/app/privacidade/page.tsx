import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { BrandWordmark } from "@/components/brand/brand";

export const metadata: Metadata = { title: "Aviso de privacidade" };

export default async function PrivacyPage() {
  // Dados públicos do aviso (controlador/contato). Nenhuma informação de aluno.
  const { data } = await createSupabaseAdminClient().from("organizations")
    .select("name, privacy_controller, privacy_contact, proof_retention_days").order("created_at").limit(1).maybeSingle();
  const pending = "[a preencher pelo responsável]";
  return (
    <div className="min-h-dvh">
      <header className="brand-gradient px-4 py-6"><div className="mx-auto max-w-3xl"><Link href="/" aria-label="CS Tennis"><BrandWordmark size="sm" /></Link></div></header>
      <main id="conteudo" className="mx-auto max-w-3xl space-y-5 px-4 py-8 text-sm leading-relaxed [&_h2]:mt-6 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold">
        <h1 className="font-display text-3xl font-bold">Aviso de privacidade</h1>
        <p className="rounded-xl border border-warning/40 bg-warning-bg p-3 text-warning">
          Modelo preparado pela equipe técnica. O conteúdo jurídico (bases legais, prazos e responsabilidades) precisa ser revisado
          e aprovado pelo responsável pelo projeto antes do uso com clientes reais.
        </p>
        <h2>Quem trata os dados</h2>
        <p>Controlador: {data?.privacy_controller ?? pending}. Contato para privacidade: {data?.privacy_contact ?? pending}.</p>
        <h2>Quais dados usamos</h2>
        <ul className="list-disc pl-5">
          <li>Cadastro: nome, tipo (adulto/criança), e-mail e/ou telefone de contato, nível técnico opcional.</li>
          <li>Responsáveis: nome, contato e vínculo com a criança (definido pelo professor).</li>
          <li>Aulas: horários, local, matrículas, presenças e cancelamentos.</li>
          <li>Financeiro: valores e vencimentos das mensalidades, pagamentos confirmados e comprovantes enviados (arquivos).</li>
          <li>Evolução e jogos: avaliações técnicas publicadas, metas e jogos registrados por você.</li>
          <li>Segurança: registros de acesso e auditoria (sem senhas ou tokens).</li>
        </ul>
        <p>Não pedimos CPF, endereço residencial ou data de nascimento.</p>
        <h2>Para que usamos</h2>
        <p>Organizar aulas, acompanhar a evolução, cobrar e conferir mensalidades e enviar avisos dentro do app. Base legal: {pending}.</p>
        <h2>Crianças</h2>
        <p>Crianças não têm login próprio. O acesso aos dados delas é feito apenas pelos responsáveis vinculados pelo professor.</p>
        <h2>Com quem compartilhamos</h2>
        <p>Com provedores de infraestrutura que operam o serviço (banco de dados, autenticação, armazenamento e hospedagem), conforme contratos desses provedores: {pending}. Não vendemos dados nem usamos para publicidade.</p>
        <h2>Por quanto tempo</h2>
        <p>
          Enquanto houver vínculo com o professor e pelo período necessário para obrigações e defesa de direitos definido pelo
          controlador ({pending}). Arquivos de comprovantes: {data?.proof_retention_days ? `excluídos ${data.proof_retention_days} dias após a quitação` : "mantidos até decisão do controlador"}.
          Cópias de segurança (backups) expiram conforme a política de retenção de backups.
        </p>
        <h2>Seus direitos</h2>
        <p>
          Você pode pedir acesso, correção, exportação ou exclusão dos seus dados pelo app (Perfil › Seus dados e privacidade) ou
          pelo contato acima. Pedidos são registrados e respondidos pelo controlador; alguns registros (por exemplo, pagamentos)
          podem precisar ser preservados de forma anonimizada.
        </p>
        <h2>Cookies</h2>
        <p>Usamos apenas cookies essenciais: sessão de login (protegida, inacessível a scripts) e preferência de tema/aluno selecionado. Não usamos cookies de publicidade ou analytics.</p>
        <h2>Segurança</h2>
        <p>Conexão criptografada, controle de acesso por vínculo, verificação em duas etapas para o professor, arquivos em armazenamento privado com links temporários e registro de auditoria. Nenhum sistema é 100% seguro; incidentes são tratados conforme procedimento documentado.</p>
        <p className="pt-4"><Link href="/" className="font-semibold text-link">Voltar ao CS Tennis</Link></p>
      </main>
    </div>
  );
}
