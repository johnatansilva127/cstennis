import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type TabProps = {
  studentId: string;
  student: {
    id: string; full_name: string; kind: "adult" | "child"; status: "active" | "paused" | "archived";
    email: string | null; phone: string | null; level: string | null; anonymized_at: string | null; organization_id: string;
  };
  supabase: SupabaseClient<Database>;
  today: string;
  tz: string;
};
