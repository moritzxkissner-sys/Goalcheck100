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
  can_receive_entries?: boolean;
};

export type TeamCalendarInput = {
  user_id: string;
  starts_on: string;
  ends_on: string;
  reason: TeamCalendarReason;
  comment: string;
};

export type TeamCalendarEntry = TeamCalendarInput & { id: string };

export function isCalendarMemberName(name: string) {
  return name.trim().length > 0;
}

export function filterCalendarMembers<T extends TeamCalendarMember>(
  members: T[],
) {
  return members.filter((member) => isCalendarMemberName(member.full_name));
}
