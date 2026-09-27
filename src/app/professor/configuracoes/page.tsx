import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Cpu, KeyRound, QrCode, ShieldCheck, ShieldAlert, UserRound } from "lucide-react";
import { requireCoach } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Configurações" };

const ITEMS = [
  { href: "/professor/configuracoes/pix", label: "Dados Pix", desc: "Recebedor, chave e Pix Copia e Cola opcional", icon: QrCode },
  { href: "/professor/configuracoes/restricoes", label: "Regras de atraso", desc: "Aviso, bloqueio de pedidos ou restrição de módulos", icon: ShieldAlert },
  { href: "/professor/configuracoes/organizacao", label: "Organização", desc: "Nome, convites, cobranças, deslocamento e lembretes", icon: Building2 },
  { href: "/professor/configuracoes/seguranca", label: "Segurança", desc: "Verificação em duas etapas e sessões", icon: ShieldCheck },
  { href: "/professor/configuracoes/privacidade", label: "Privacidade", desc: "Controlador, contato, retenção e solicitações", icon: KeyRound },
  { href: "/professor/configuracoes/sistema", label: "Sistema", desc: "Rotinas automáticas e integrações", icon: Cpu },
  { href: "/professor/configuracoes/perfil", label: "Perfil e tema", desc: "Nome, aparência e senha", icon: UserRound },
];

export default async function SettingsPage() {
  await requireCoach();
  return (
    <>
      <PageHeader title="Configurações" />
      <ul className="grid gap-3 sm:grid-cols-2">
        {ITEMS.map(({ href, label, desc, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="flex min-h-20 items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card hover:bg-surface-2">
              <Icon aria-hidden className="mt-0.5 size-6 text-link" />
              <span><span className="block font-semibold">{label}</span><span className="block text-sm text-muted">{desc}</span></span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
