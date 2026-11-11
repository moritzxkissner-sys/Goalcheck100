import {
  offerAuth,
  offerError,
  offerHeaders,
  validOfferId,
  validOrigin,
} from "@/lib/offers-api";
import {
  FOLLOW_UP_COLUMNS as columns,
  parseFollowUpInput,
  parseFollowUpRange,
} from "@/lib/follow-ups";
import { readCalendarPages } from "@/lib/read-calendar-pages";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await offerAuth();
  if (!auth) return offerError("Nicht angemeldet.", 401);
  const url = new URL(request.url);
  const range = parseFollowUpRange(
    url.searchParams.get("from"),
    url.searchParams.get("to"),
  );
  if (!range) return offerError("Ungültiger Zeitraum.", 400);
  const assignee = url.searchParams.get("assigned_to");
  if (assignee !== null && !validOfferId(assignee))
    return offerError("Ungültiger Empfänger.", 400);
  const [permission, members] = await Promise.all([
    auth.db.rpc("can_manage_team_calendar"),
    auth.db.rpc("follow_up_members"),
  ]);
  if (permission.error || members.error)
    return offerError(
      "Kalenderberechtigungen konnten nicht geladen werden.",
      500,
    );
  let data;
  try {
    data = await readCalendarPages((from, to) => {
      let query = auth.db.from("follow_up_tasks").select(columns);
      if (assignee) query = query.eq("assigned_to", assignee);
      return query
        .gte("start_time", range.from)
        .lt("start_time", range.to)
        .order("start_time", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
    });
  } catch {
    return offerError("Termine konnten nicht vollständig geladen werden.", 500);
  }
  return Response.json(
    {
      tasks: data,
      currentUserId: auth.user.id,
      canAssign: permission.data === true,
      members: members.data ?? [],
    },
    { headers: offerHeaders },
  );
}

export async function POST(request: Request) {
  const auth = await offerAuth();
  if (!auth) return offerError("Nicht angemeldet.", 401);
  if (!validOrigin(request)) return offerError("Ungültige Anfrage.", 403);
  const input = parseFollowUpInput(await request.json().catch(() => null));
  if (!input) return offerError("Bitte Termin und Kundendaten prüfen.", 400);
  const { data, error } = await auth.db
    .from("follow_up_tasks")
    .insert({
      ...input,
      owner_id: auth.user.id,
      assigned_to: input.assigned_to ?? auth.user.id,
    })
    .select(columns)
    .single();
  if (error)
    return offerError(
      "Termin konnte nicht gespeichert werden.",
      error.code === "42501" ? 403 : 500,
    );
  return Response.json({ task: data }, { status: 201, headers: offerHeaders });
}
