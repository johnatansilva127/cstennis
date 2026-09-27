import {
  Bell, CalendarDays, ClipboardList, Home, LayoutGrid, MapPin, Settings, TrendingUp, Trophy, Users, Wallet,
} from "lucide-react";
import { AppShell } from "@/components/nav/shell";
import { requireCoach } from "@/lib/auth";

export default async function CoachLayout({ children }: LayoutProps<"/professor">) {
  const { supabase, ctx } = await requireCoach();
  const [{ count: unread }, { count: requests }, { count: proofs }] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    supabase.from("enrollment_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("payment_submissions").select("id", { count: "exact", head: true }).in("status", ["received", "under_review"]),
  ]);
  const sidebar = [
    { href: "/professor", label: "Início", icon: <Home />, exact: true },
    { href: "/professor/agenda", label: "Agenda", icon: <CalendarDays /> },
    { href: "/professor/alunos", label: "Alunos", icon: <Users /> },
    { href: "/professor/pedidos", label: "Pedidos de vaga", icon: <ClipboardList />, badge: requests ?? 0 },
    { href: "/professor/financeiro", label: "Financeiro", icon: <Wallet />, badge: proofs ?? 0 },
    { href: "/professor/evolucao", label: "Evolução", icon: <TrendingUp /> },
    { href: "/professor/jogos", label: "Jogos", icon: <Trophy /> },
    { href: "/professor/locais", label: "Locais e quadras", icon: <MapPin /> },
    { href: "/professor/avisos", label: "Avisos", icon: <Bell />, badge: unread ?? 0 },
    { href: "/professor/configuracoes", label: "Configurações", icon: <Settings /> },
  ];
  const bottom = [
    { href: "/professor", label: "Início", icon: <Home />, exact: true },
    { href: "/professor/agenda", label: "Agenda", icon: <CalendarDays /> },
    { href: "/professor/alunos", label: "Alunos", icon: <Users /> },
    { href: "/professor/financeiro", label: "Financeiro", icon: <Wallet />, badge: proofs ?? 0 },
    { href: "/professor/mais", label: "Mais", icon: <LayoutGrid />, badge: (requests ?? 0) || undefined },
  ];
  return (
    <AppShell sidebarItems={sidebar} bottomItems={bottom} userName={ctx.full_name || ctx.email} roleLabel="Professor"
      notificationsHref="/professor/avisos" unread={unread ?? 0}>
      {children}
    </AppShell>
  );
}
