import type { Metadata } from "next";
import Link from "next/link";
import { Bell, ClipboardList, LogOut, MapPin, Settings, TrendingUp, Trophy, UserPlus, Users2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Mais" };

const ITEMS = [
  { href: "/professor/pedidos", label: "Pedidos de vaga", icon: ClipboardList },
  { href: "/professor/evolucao", label: "Evolução", icon: TrendingUp },
  { href: "/professor/jogos", label: "Jogos dos alunos", icon: Trophy },
  { href: "/professor/responsaveis", label: "Responsáveis", icon: Users2 },
  { href: "/professor/convites", label: "Convites", icon: UserPlus },
  { href: "/professor/locais", label: "Locais e quadras", icon: MapPin },
  { href: "/professor/avisos", label: "Avisos", icon: Bell },
  { href: "/professor/configuracoes", label: "Configurações", icon: Settings },
];

export default function MorePage() {
  return (
    <>
      <PageHeader title="Mais opções" />
      <ul className="grid gap-2 sm:grid-cols-2">
        {ITEMS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-surface px-4 font-semibold shadow-card hover:bg-surface-2">
              <Icon aria-hidden className="size-5 text-link" /> {label}
            </Link>
          </li>
        ))}
        <li>
          <form action="/auth/sair" method="post">
            <button type="submit" className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 font-semibold text-danger shadow-card">
              <LogOut aria-hidden className="size-5" /> Sair
            </button>
          </form>
        </li>
      </ul>
    </>
  );
}
