import type { Metadata } from "next";
import { requireCoach } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { ProfileForms } from "@/components/profile-forms";

export const metadata: Metadata = { title: "Perfil" };

export default async function CoachProfilePage() {
  const { ctx } = await requireCoach();
  return (
    <>
      <PageHeader back={{ href: "/professor/configuracoes", label: "Configurações" }} title="Perfil e tema" description={ctx.email} />
      <ProfileForms fullName={ctx.full_name} theme={ctx.theme} />
    </>
  );
}
