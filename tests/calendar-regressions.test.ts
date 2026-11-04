import test from "node:test";
import assert from "node:assert/strict";
import {
  layoutCalendarDay,
  CALENDAR_HOUR_HEIGHT,
} from "../lib/calendar-layout";
import { berlinLocalToIso, type FollowUpTask } from "../lib/follow-ups";
import { readCalendarPages } from "../lib/read-calendar-pages";

function task(id: string, start: string, end: string): FollowUpTask {
  return {
    id,
    owner_id: "owner",
    assigned_to: "owner",
    title: "Nachfassen",
    customer_name: "Max Mustermann",
    offer_subject: "Rechtsschutz",
    customer_email: null,
    customer_phone: null,
    notes: "",
    status: "pending",
    start_time: berlinLocalToIso(`2026-11-09T${start}`)!,
    end_time: berlinLocalToIso(`2026-11-09T${end}`)!,
    created_at: "",
    updated_at: "",
  };
}

test("minutes and evening times share one fixed axis, independent of other cards", () => {
  const morning = task("a", "09:30", "10:30");
  const evening = task("b", "21:00", "22:00");
  const layout = layoutCalendarDay([evening, morning]);
  assert.equal(layout[0].top, 1.5 * CALENDAR_HOUR_HEIGHT);
  assert.equal(layout[0].height, CALENDAR_HOUR_HEIGHT);
  assert.equal(layout[1].top, 13 * CALENDAR_HOUR_HEIGHT);
  assert.equal(layout[1].top + layout[1].height, 14 * CALENDAR_HOUR_HEIGHT);
  assert.equal(layoutCalendarDay([evening])[0].top, layout[1].top);
});

test("overlapping cards get separate lanes; touching appointments can reuse a lane", () => {
  const events = [
    task("b", "09:30", "10:30"),
    task("a", "09:00", "10:00"),
    task("c", "10:30", "11:30"),
  ];
  const layout = layoutCalendarDay(events);
  assert.deepEqual(
    layout.map((e) => [e.task.id, e.lane, e.lanes]),
    [
      ["a", 0, 2],
      ["b", 1, 2],
      ["c", 0, 1],
    ],
  );
  assert.deepEqual(layoutCalendarDay([...events].reverse()), layout);
});

test("short and long-name cards remain readable without covering a subsequent card", () => {
  const long = {
    ...task("a", "09:00", "09:05"),
    customer_name:
      "Maximilian Alexander Mustermann mit einem langen vollständigen Namen",
    offer_subject:
      "Besprechung des vollständigen Rechtsschutz-Angebots und Rückfragen",
  };
  const [a, b] = layoutCalendarDay([long, task("b", "09:10", "09:30")]);
  assert.ok(a.height > 112);
  assert.equal(a.lanes, 2);
  assert.notEqual(a.lane, b.lane);
});

test("calendar reads beyond 500 appointments and never returns a partial page after an error", async () => {
  const source = Array.from({ length: 1001 }, (_, id) => ({ id }));
  const calls: number[] = [];
  const result = await readCalendarPages(async (from, to) => {
    calls.push(from);
    return { data: source.slice(from, to + 1), error: null };
  });
  assert.deepEqual(result, source);
  assert.deepEqual(calls, [0, 500, 1000]);
  await assert.rejects(
    readCalendarPages(async (from, to) =>
      from
        ? { data: null, error: new Error("offline") }
        : { data: source.slice(from, to + 1), error: null },
    ),
  );
  let emptyCalls = 0;
  assert.deepEqual(
    await readCalendarPages(async () => {
      emptyCalls++;
      return { data: [], error: null };
    }),
    [],
  );
  assert.equal(emptyCalls, 1);
});
