import Link from "next/link";
import { Bell, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { BrandWordmark } from "@/components/brand/brand";
import { BottomNav, SidebarLinks, type NavItem } from "./nav-links";

export function AppShell({
  sidebarItems, bottomItems, userName, roleLabel, notificationsHref, unread, topSlot, children,
}: {
  sidebarItems: NavItem[]; bottomItems: NavItem[]; userName: string; roleLabel: string;
  notificationsHref: string; unread: number; topSlot?: (variant: "header" | "bar") => ReactNode; children: ReactNode;
}) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="brand-gradient sticky top-0 hidden h-dvh flex-col gap-6 overflow-y-auto p-4 lg:flex">
        <Link href="/" className="flex justify-center pt-2" aria-label="CS Tennis — início">
          <BrandWordmark size="md" />
        </Link>
        <nav aria-label="Navegação principal" className="flex-1">
          <SidebarLinks items={sidebarItems} />
        </nav>
        <div className="border-t border-white/15 pt-4 text-sm">
          <p className="truncate font-semibold">{userName}</p>
          <p className="text-xs text-white/75">{roleLabel}</p>
          <form action="/auth/sair" method="post" className="mt-2">
            <button type="submit" className="inline-flex min-h-11 items-center gap-2 font-semibold text-white/90 hover:text-white">
              <LogOut aria-hidden className="size-4" /> Sair
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="brand-gradient sticky top-0 z-20 flex items-center justify-between gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:hidden">
          <Link href="/" aria-label="CS Tennis — início"><BrandWordmark size="sm" /></Link>
          <div className="flex min-w-0 items-center gap-2">
            {topSlot?.("header")}
            <Link href={notificationsHref} className="relative inline-flex size-11 items-center justify-center rounded-full text-white hover:bg-white/10"
              aria-label={unread > 0 ? `Avisos: ${unread} não lidos` : "Avisos"}>
              <Bell aria-hidden className="size-5" />
              {unread > 0 ? <span aria-hidden className="absolute right-2 top-2 size-2.5 rounded-full bg-accent ring-2 ring-deep" /> : null}
            </Link>
          </div>
        </header>
        {topSlot ? <div className="hidden border-b border-border bg-surface px-6 py-2 lg:block">{topSlot("bar")}</div> : null}
        <main id="conteudo" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-5 sm:px-6 lg:pb-12 lg:pt-8">
          {children}
        </main>
      </div>
      <BottomNav items={bottomItems} label="Navegação principal" />
    </div>
  );
}
