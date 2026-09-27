"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export type NavItem = { href: string; label: string; icon: ReactNode; exact?: boolean; badge?: number };

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function SidebarLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const active = isActive(pathname, item);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors",
                active ? "bg-white text-deep" : "text-white/90 hover:bg-white/10",
              )}
            >
              <span aria-hidden className="shrink-0 [&_svg]:size-5">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.badge ? (
                <span className="rounded-full bg-accent px-2 text-xs font-bold text-on-accent">
                  {item.badge}<span className="sr-only"> não lidos</span>
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function BottomNav({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className={cn("mx-auto grid max-w-xl", items.length === 5 ? "grid-cols-5" : "grid-cols-4")}>
        {items.map((item) => {
          const active = isActive(pathname, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[0.7rem] font-semibold",
                  active ? "text-link" : "text-muted",
                )}
              >
                <span aria-hidden className="[&_svg]:size-5">{item.icon}</span>
                {item.label}
                {item.badge ? (
                  <span className="absolute right-[22%] top-1.5 min-w-4 rounded-full bg-danger px-1 text-center text-[0.6rem] font-bold text-white">
                    {item.badge}<span className="sr-only"> não lidos</span>
                  </span>
                ) : null}
                {active ? <span aria-hidden className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-primary" /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
