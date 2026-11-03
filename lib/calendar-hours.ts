import { isoToBerlinLocal } from "./follow-ups";

export const CALENDAR_START_HOUR = 8;
export const CALENDAR_END_HOUR = 22;
export const calendarHours = Array.from(
  { length: CALENDAR_END_HOUR - CALENDAR_START_HOUR },
  (_, index) => index + CALENDAR_START_HOUR,
);

/** Visible grid only; bookings outside this range remain allowed. */
export function isInCalendarGrid(startTime: string) {
  const hour = Number(isoToBerlinLocal(startTime).slice(11, 13));
  return hour >= CALENDAR_START_HOUR && hour < CALENDAR_END_HOUR;
}

