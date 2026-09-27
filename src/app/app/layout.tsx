import { Bell, CalendarDays, ClipboardList, Home, LayoutGrid, Percent, TrendingUp, Trophy, UserRound, Wallet } from "lucide-react";
import { AppShell } from "@/components/nav/shell";
import { StudentSwitcher } from "@/components/nav/student-switcher";
import { currentStudent, requireParticipant } from "@/lib/auth";

export default async function ParticipantLayout({ children }: LayoutProps<"/app">) {
  const { supabase, ctx } = await requireParticipant();
  const student = await currentStudent(ctx);
  const { count: unread } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  const options = ctx.students.map((s) => ({ id: s.id, label: s.relation === "student" ? `${s.full_name} (você)` : s.full_name }));
  const hasGuardian = ctx.students.some((s) => s.relation === "guardian");
  const sidebar = [
    { href: "/app", label: "Início", icon: <Home />, exact: true },
    { href: "/app/aulas", label: "Aulas", icon: <CalendarDays /> },
    { href: "/app/horarios", label: "Horários e pedidos", icon: <ClipboardList /> },
    { href: "/app/financeiro", label: "Mensalidades", icon: <Wallet /> },
    { href: "/app/frequencia", label: "Frequência", icon: <Percent /> },
    { href: "/app/evolucao", label: "Evolução", icon: <TrendingUp /> },
    { href: "/app/jogos", label: "Jogos", icon: <Trophy /> },
    { href: "/app/avisos", label: "Avisos", icon: <Bell />, badge: unread ?? 0 },
    { href: "/app/perfil", label: "Perfil", icon: <UserRound /> },
  ];
  const bottom = [
    { href: "/app", label: "Início", icon: <Home />, exact: true },
    { href: "/app/aulas", label: "Aulas", icon: <CalendarDays /> },
    { href: "/app/financeiro", label: "Mensalidades", icon: <Wallet /> },
    { href: "/app/evolucao", label: "Evolução", icon: <TrendingUp /> },
    { href: "/app/mais", label: "Mais", icon: <LayoutGrid /> },
  ];
  return (
    <AppShell sidebarItems={sidebar} bottomItems={bottom} userName={ctx.full_name || ctx.email}
      roleLabel={hasGuardian ? "Responsável" : "Aluno"} notificationsHref="/app/avisos" unread={unread ?? 0}
      topSlot={options.length > 1 ? (v) => <StudentSwitcher students={options} current={student.id} tone={v === "header" ? "dark" : "light"} /> : undefined}>
      {children}
    </AppShell>
  );
}
