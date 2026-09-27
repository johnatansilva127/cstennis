import type { Metadata } from "next";
import { AuthCard } from "@/components/ui/auth-card";

export const metadata: Metadata = { title: "Acesso negado" };

export default function AccessDeniedPage() {
  return (
    <AuthCard eyebrow="Acesso" title="Sem acesso a esta área">
      <p className="text-sm text-muted">
        Sua conta não tem permissão para este conteúdo ou o vínculo com o professor foi encerrado. Se acredita que é um
        engano, fale com o professor.
      </p>
      <form action="/auth/sair" method="post" className="mt-6">
        <button type="submit" className="min-h-11 w-full rounded-xl bg-primary-strong px-4 font-semibold text-on-primary">
          Sair e entrar com outra conta
        </button>
      </form>
    </AuthCard>
  );
}
