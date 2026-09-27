import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

export const metadata: Metadata = {
  title: { default: "CS Tennis", template: "%s · CS Tennis" },
  description: "Gestão de alunos, aulas, evolução e mensalidades do CS Tennis.",
  applicationName: "CS Tennis",
  robots: { index: false, follow: false },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#064d8e" },
    { media: "(prefers-color-scheme: dark)", color: "#091827" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Preferência de tema lida no servidor: o HTML já sai com o tema certo (sem flash).
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="pt-BR" data-theme={theme}>
      <body className="min-h-dvh">
        <a href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-text">
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
