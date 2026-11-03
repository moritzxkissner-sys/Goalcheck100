import test from "node:test";
import assert from "node:assert/strict";
import {
  calendarHours,
  CALENDAR_END_HOUR,
  isInCalendarGrid,
} from "../lib/calendar-hours";
import { berlinLocalToIso, parseFollowUpInput } from "../lib/follow-ups";

test("evening appointments use the regular Berlin hours grid through 22:00", () => {
  assert.equal(calendarHours[0], 8);
  assert.equal(calendarHours.at(-1), 21);
  assert.equal(CALENDAR_END_HOUR, 22);
  for (const time of ["18:30", "19:00", "20:15", "21:30"])
    assert.equal(
      isInCalendarGrid(berlinLocalToIso(`2026-11-09T${time}`)!),
      true,
    );
  for (const time of ["07:30", "22:00", "22:30"])
    assert.equal(
      isInCalendarGrid(berlinLocalToIso(`2026-11-09T${time}`)!),
      false,
    );
});

test("ending at 22:00 and later bookings preserve existing validation rules", () => {
  for (const [start, end] of [
    ["21:30", "22:00"],
    ["22:00", "22:30"],
  ]) {
    assert.ok(
      parseFollowUpInput({
        title: "Nachfassen",
        customer_name: "Kundin",
        offer_subject: "Angebot",
        start_time: berlinLocalToIso(`2026-11-09T${start}`),
        end_time: berlinLocalToIso(`2026-11-09T${end}`),
      }),
    );
  }
});

