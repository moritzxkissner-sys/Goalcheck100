import { redirect } from "next/navigation";
import Dashboard from "@/components/dashboard";
import { isConfigured, supabaseServer } from "@/lib/supabase/server";
import {
  currentMonth,
  berlinDate,
  monthBounds,
  type Entry,
  type Partner,
  type DailyPartner,
} from "@/lib/metrics";
import { monthSchema } from "@/lib/validation";
import { demoData } from "@/lib/demo";
export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const month = monthSchema.safeParse(params.month).success
    ? params.month!
    : currentMonth();
  if (!isConfigured()) return <Dashboard initial={demoData(month)} demo />;
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("full_name,active")
    .eq("id", user.id)
    .single();
  if (profileError || !profile?.active) redirect("/login?notice=inactive");
  const { start, end } = monthBounds(month);
  // Supabase limits each response to 1,000 rows by default. Read every page so
  // personal totals remain consistent with the database's full-team aggregate.
  async function loadEntries() {
    const rows: Entry[] = [];
    for (let offset = 0; ; offset += 500) {
      const page = await db
        .from("sales_entries")
        .select(
          "id,user_id,amount,category,transaction_type,occurred_on,note,customer_name",
        )
        .eq("user_id", user!.id)
        .gte("occurred_on", start)
        .lt("occurred_on", end)
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id")
        .range(offset, offset + 499);
      if (page.error) return { data: rows, error: page.error };
      rows.push(...(page.data as Entry[]));
      if (page.data.length < 500) return { data: rows, error: null };
    }
  }
  const [entries, goal, team, daily] = await Promise.all([
    loadEntries(),
    db
      .from("monthly_goals")
      .select("target")
      .eq("user_id", user.id)
      .eq("month", start)
      .maybeSingle(),
    db.rpc("team_leaderboard", { selected_month: start }),
    db.rpc("team_daily_leaderboard"),
  ]);
  if (entries.error || goal.error || team.error || daily.error)
    throw new Error(
      "Die Daten konnten nicht geladen werden. Bitte prüfe die Supabase-Einrichtung.",
    );
  return (
    <Dashboard
      initial={{
        userId: user.id,
        name: profile.full_name,
        email: user.email ?? "",
        month,
        daily: {
          date: daily.data?.[0]?.day ?? berlinDate(),
          partners: (daily.data ?? []).map((p: DailyPartner) => ({
            user_id: p.user_id,
            full_name: p.full_name,
            total: Number(p.total),
          })),
        },
        target: Number(goal.data?.target ?? 10000),
        entries: (entries.data ?? []).map((e) => ({
          ...e,
          amount: Number(e.amount),
        })) as Entry[],
        partners: (team.data ?? []).map((p: Partner) => ({
          ...p,
          total: Number(p.total),
          target: Number(p.target),
          entry_count: Number(p.entry_count),
        })),
      }}
    />
  );
}
