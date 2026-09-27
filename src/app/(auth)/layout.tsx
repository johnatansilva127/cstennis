import { BrandWordmark, CourtLines } from "@/components/brand/brand";

/** Telas públicas: degradê azul, linhas de quadra sutis e cartão arredondado. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="brand-gradient relative min-h-dvh overflow-hidden">
      <CourtLines />
      <main id="conteudo" className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-10 pt-[max(2.5rem,env(safe-area-inset-top))]">
        <div className="mb-8 flex justify-center pt-6">
          <BrandWordmark size="lg" />
        </div>
        {children}
      </main>
    </div>
  );
}
