import type { Metadata } from "next";
import { participantContext } from "@/lib/participant";
import { PageHeader } from "@/components/ui/page-header";
import { NotificationsList } from "@/components/notifications-list";
import { markAllReadAction } from "@/app/notification-actions";

export const metadata: Metadata = { title: "Avisos" };

export default async function ParticipantNotifications() {
  const { supabase, tz } = await participantContext();
  const { data } = await supabase.from("notifications").select("id, category, title, body, link_path, read_at, created_at")
    .order("created_at", { ascending: false }).limit(100);
  return (
    <>
      <PageHeader title="Avisos" />
      <NotificationsList items={data ?? []} tz={tz} markAll={markAllReadAction} />
    </>
  );
}
