import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/ui/auth-card";
import { Alert } from "@/components/ui/status";

export const metadata: Metadata = { title: "Recuperar senha" };

export default async function RecoverPage({ searchParams }: PageProps<"/recuperar-senha">) {
  const params = await searchParams;
  return (
    <AuthCard eyebrow="Acesso" title="Recuperar senha" footer={<Link href="/entrar" className="font-semibold text-white underline">Voltar para entrar</Link>}>
      {params.erro === "link" ? (
        <Alert tone="warning" className="mb-4">O link é inválido, já foi usado ou expirou. Peça um novo ao professor.</Alert>
      ) : null}
      <p className="text-sm text-muted">
        Peça ao professor um link para criar uma nova senha. Ele gera o link no app e envia para você (por exemplo, pelo
        WhatsApp). O link vale por 1 hora e só pode ser usado uma vez.
      </p>
      <p className="mt-3 text-sm text-muted">Se você é o professor, fale com o responsável técnico do sistema.</p>
    </AuthCard>
  );
}
