export const calendarReasons = [
  "Urlaub",
  "Krankheit",
  "Homeoffice",
  "Weiterbildung",
  "Sonstiges",
] as const;

export type TeamCalendarReason = (typeof calendarReasons)[number];

export type TeamCalendarMember = {
  id: string;
  full_name: string;
};

export type TeamCalendarInput = {
  user_id: string;
  starts_on: string;
  ends_on: string;
  reason: TeamCalendarReason;
  comment: string;
};

export type TeamCalendarEntry = TeamCalendarInput & { id: string };

const excludedCalendarNames = new Set([
  "moritz kissner",
  "alina dalga",
  "alina dalgar",
  "lilli fischer",
  "lilly fischer",
]);

export function isCalendarMemberName(name: string) {
  return !excludedCalendarNames.has(name.trim().replace(/\s+/g, " ").toLocaleLowerCase("de-DE"));
}

export function filterCalendarMembers<T extends TeamCalendarMember>(members: T[]) {
  return members.filter((member) => isCalendarMemberName(member.full_name));
}
