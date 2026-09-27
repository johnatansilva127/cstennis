import Link from "next/link";
import { Bell, CalendarDays, Trophy, TrendingUp, UserRound, Wallet } from "lucide-react";
import { formatDateTime } from "@/lib/dates";
import { EmptyState } from "@/components/ui/states";
import { ActionForm } from "@/components/ui/form";
import type { ActionState } from "@/lib/errors";
import { cn } from "@/components/ui/cn";

type N = { id: string; category: string; title: string; body: string; link_path: string | null; read_at: string | null; created_at: string };

const ICONS: Record<string, React.ReactNode> = {
  schedule: <CalendarDays aria-hidden className="size-5" />, finance: <Wallet aria-hidden className="size-5" />,
  evolution: <TrendingUp aria-hidden className="size-5" />, matches: <Trophy aria-hidden className="size-5" />,
  account: <UserRound aria-hidden className="size-5" />,
};

export function NotificationsList({ items, tz, markAll }: { items: N[]; tz: string; markAll: (s: ActionState) => Promise<ActionState> }) {
  const unread = items.filter((n) => !n.read_at).length;
  return (
    <div className="space-y-3">
      {unread > 0 ? (
        <ActionForm action={markAll} submitLabel={`Marcar ${unread} como lido(s)`} submitVariant="secondary" submitFull={false} pendingLabel="Marcando…">
          <span className="sr-only">Marcar todos os avisos como lidos</span>
        </ActionForm>
      ) : null}
      {items.length === 0 ? <EmptyState icon={<Bell aria-hidden className="size-8" />} title="Nenhum aviso" description="Avisos sobre aulas, pagamentos e evolução aparecem aqui." /> : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          {items.map((n) => {
            const content = (
              <>
                <span className={cn("mt-0.5 shrink-0", n.read_at ? "text-muted" : "text-link")}>{ICONS[n.category] ?? <Bell aria-hidden className="size-5" />}</span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block", n.read_at ? "font-medium" : "font-bold")}>
                    {n.title}{!n.read_at ? <span className="ml-2 rounded-full bg-accent px-2 text-xs font-bold text-on-accent">Novo</span> : null}
                  </span>
                  <span className="block text-sm text-muted">{n.body}</span>
                  <span className="block text-xs text-muted">{formatDateTime(n.created_at, tz)}</span>
                </span>
              </>
            );
            return (
              <li key={n.id}>
                {n.link_path ? <Link href={n.link_path} className="flex gap-3 px-4 py-3 hover:bg-surface-2">{content}</Link>
                  : <div className="flex gap-3 px-4 py-3">{content}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
