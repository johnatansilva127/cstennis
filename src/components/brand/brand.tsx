import { cn } from "@/components/ui/cn";

/**
 * Marca temporária em texto ("CS Tennis"). Para usar o logotipo oficial,
 * coloque o arquivo em public/brand/logo.svg e defina BRAND_LOGO_SRC=/brand/logo.svg.
 */
export function BrandWordmark({ size = "md", className, tagline = true }: { size?: "sm" | "md" | "lg"; className?: string; tagline?: boolean }) {
  const logo = process.env.BRAND_LOGO_SRC;
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt="CS Tennis" className={cn(size === "lg" ? "h-24" : size === "md" ? "h-12" : "h-8", "w-auto", className)} />;
  }
  const main = size === "lg" ? "text-6xl" : size === "md" ? "text-3xl" : "text-xl";
  const sub = size === "lg" ? "text-sm tracking-[0.55em]" : size === "md" ? "text-[0.65rem] tracking-[0.45em]" : "text-[0.55rem] tracking-[0.35em]";
  return (
    <span className={cn("inline-flex flex-col items-center leading-none text-white", className)} aria-label="CS Tennis" role="img">
      <span aria-hidden className={cn("font-display font-black tracking-tight", main)}>
        CS
      </span>
      {tagline ? (
        <span aria-hidden className={cn("mt-1 font-display font-bold uppercase text-accent", sub)}>
          Tennis
        </span>
      ) : null}
    </span>
  );
}

/** Linhas de quadra decorativas (puramente visuais). */
export function CourtLines({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 360 780" preserveAspectRatio="xMidYMid meet"
      className={cn("pointer-events-none absolute inset-0 h-full w-full text-white/15", className)} fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="30" y="80" width="300" height="620" />
      <line x1="67" y1="80" x2="67" y2="700" />
      <line x1="293" y1="80" x2="293" y2="700" />
      <line x1="30" y1="390" x2="330" y2="390" strokeDasharray="4 6" />
      <line x1="67" y1="245" x2="293" y2="245" />
      <line x1="67" y1="535" x2="293" y2="535" />
      <line x1="180" y1="245" x2="180" y2="535" />
      <circle cx="330" cy="40" r="110" className="text-[#3fb3e3]/20" fill="currentColor" stroke="none" />
    </svg>
  );
}
