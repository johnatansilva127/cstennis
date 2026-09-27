import type { ReactNode } from "react";

export function AuthCard({ eyebrow, title, children, footer }: { eyebrow?: string; title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <>
      <section className="rounded-3xl bg-surface p-6 text-text shadow-2xl sm:p-8">
        {eyebrow ? <p className="label-caps text-link">{eyebrow}</p> : null}
        <h1 className="mt-2 mb-6 font-display text-2xl font-bold">{title}</h1>
        {children}
      </section>
      {footer ? <div className="mt-8 text-center text-sm text-white/85">{footer}</div> : null}
    </>
  );
}
