import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeader({ title, description, actions, back, eyebrow }: {
  title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string }; eyebrow?: ReactNode;
}) {
  return (
    <header className="mb-5 space-y-2">
      {back ? (
        <Link href={back.href} className="-ml-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-link">
          <ChevronLeft aria-hidden className="size-4" /> {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? <p className="label-caps text-link">{eyebrow}</p> : null}
          <h1 className="font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">{title}</h1>
          {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
