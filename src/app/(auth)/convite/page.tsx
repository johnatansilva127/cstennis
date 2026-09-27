import type { Metadata } from "next";
import { AuthCard } from "@/components/ui/auth-card";
import { InviteFlow } from "./invite-flow";

export const metadata: Metadata = { title: "Convite", referrer: "no-referrer" };

export default function InvitePage() {
  return (
    <AuthCard eyebrow="Convite" title="Ative seu acesso" footer={<p>Dúvidas? Fale diretamente com o professor.</p>}>
      <InviteFlow />
    </AuthCard>
  );
}
