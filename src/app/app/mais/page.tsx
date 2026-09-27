import type { Metadata } from "next";
import Link from "next/link";
import { Bell, ClipboardList, LogOut, Percent, ShieldCheck, Trophy, UserRound } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Mais" };

const ITEMS = [
  { href: "/app/horarios", label: "Horários e pedidos de vaga", icon: ClipboardList },
  { href: "/app/frequencia", label: "Frequência", icon: Percent },
  { href: "/app/jogos", label: "Meus jogos", icon: Trophy },
  { href: "/app/avisos", label: "Avisos", icon: Bell },
  { href: "/app/perfil", label: "Perfil, tema e privacidade", icon: UserRound },
  { href: "/privacidade", label: "Aviso de privacidade", icon: ShieldCheck },
];

export default function ParticipantMore() {
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
