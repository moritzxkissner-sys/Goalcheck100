import { offerAuth, offerError, offerHeaders } from "@/lib/offers-api";
import {
  FOLLOW_UP_COLUMNS,
  FOLLOW_UP_SEARCH_PAGE_SIZE,
  followUpSearchFilter,
  parseFollowUpSearch,
} from "@/lib/follow-ups";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await offerAuth();
  if (!auth) return offerError("Nicht angemeldet.", 401);
  const search = parseFollowUpSearch(new URL(request.url).searchParams);
  if (!search) return offerError("Bitte Suchbegriff und Filter prüfen.", 400);
  let query = auth.db.from("follow_up_tasks").select(FOLLOW_UP_COLUMNS);
  if (search.q) query = query.or(followUpSearchFilter(search.q));
  if (search.type) query = query.eq("appointment_type", search.type);
  if (search.from) query = query.gte("start_time", search.from);
  if (search.to) query = query.lt("start_time", search.to);
  const offset = search.page * FOLLOW_UP_SEARCH_PAGE_SIZE;
  const { data, error } = await query
    .order("start_time", { ascending: true })
    .order("id", { ascending: true })
    .range(offset, offset + FOLLOW_UP_SEARCH_PAGE_SIZE);
  if (error) return offerError("Termine konnten nicht gesucht werden.", 500);
  const tasks = data ?? [];
  return Response.json(
    {
      tasks: tasks.slice(0, FOLLOW_UP_SEARCH_PAGE_SIZE),
      hasMore: tasks.length > FOLLOW_UP_SEARCH_PAGE_SIZE,
    },
    { headers: offerHeaders },
  );
}
