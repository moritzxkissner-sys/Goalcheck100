import { isoToBerlinLocal, type FollowUpTask } from "./follow-ups";
import { CALENDAR_START_HOUR } from "./calendar-hours";

export const CALENDAR_HOUR_HEIGHT = 180;
export const CALENDAR_EVENT_MIN_HEIGHT = 232;

/** Keep the shared time axis fixed; cards never push later hours down. */
export function layoutCalendarDay(tasks: FollowUpTask[]) {
  const minute = (iso: string) => {
    const local = isoToBerlinLocal(iso);
    return Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16));
  };
  const sorted = tasks
    .map((task) => {
      const start = minute(task.start_time);
      const end = minute(task.end_time);
      const top =
        ((start - CALENDAR_START_HOUR * 60) * CALENDAR_HOUR_HEIGHT) / 60;
      const height = Math.max(
        CALENDAR_EVENT_MIN_HEIGHT,
        184 +
          (Math.ceil(task.customer_name.length / 28) +
            Math.ceil(task.offer_subject.length / 28)) *
            19,
        ((end - start) * CALENDAR_HOUR_HEIGHT) / 60,
      );
      return { task, top, height, lane: 0, lanes: 1 };
    })
    .sort((a, b) => a.top - b.top || a.task.id.localeCompare(b.task.id));
  let group: typeof sorted = [];
  let laneEnds: number[] = [];
  let groupEnd = -Infinity;
  const finish = () => {
    for (const entry of group) entry.lanes = laneEnds.length;
    group = [];
    laneEnds = [];
  };
  for (const entry of sorted) {
    if (entry.top >= groupEnd) finish();
    let lane = laneEnds.findIndex((end) => end <= entry.top);
    if (lane === -1) lane = laneEnds.length;
    entry.lane = lane;
    laneEnds[lane] = entry.top + entry.height;
    groupEnd = Math.max(...laneEnds);
    group.push(entry);
  }
  finish();
  return sorted;
}
