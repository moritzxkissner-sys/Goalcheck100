"use client";

import { CalendarX2, CalendarClock, Heart } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type { FollowUpOutcome, FollowUpTask } from "@/lib/follow-ups";
import styles from "./follow-up-calendar.module.css";

const outcomes = [
  {
    value: "no_show",
    label: "Interessent Termin nicht eingehalten",
    short: "Nicht erschienen",
    name: "Nicht erschienen",
    Icon: CalendarX2,
  },
  {
    value: "reschedule_requested",
    label: "Interessent möchte Termin verschieben",
    short: "Verschieben",
    name: "Verschiebung gewünscht",
    Icon: CalendarClock,
  },
  { value: "sale", label: "Sale", short: "Sale", name: "Sale", Icon: Heart },
] as const;

export default function FollowUpOutcomeCard({
  task,
  children,
  className,
  style,
  title,
  onClick,
  onOutcome,
  disabled,
  pending,
  list = false,
}: {
  task: FollowUpTask;
  children: ReactNode;
  className: string;
  style?: CSSProperties;
  title?: string;
  onClick: () => void;
  onOutcome: (task: FollowUpTask, outcome: FollowUpOutcome | null) => void;
  disabled: boolean;
  pending: boolean;
  list?: boolean;
}) {
  const result = outcomes.find(
    (outcome) => outcome.value === task.outcome_status,
  );
  return (
    <div
      role="group"
      aria-label={`Termin ${task.customer_name}`}
      className={list ? styles.outcomeListCard : styles.outcomeCard}
      style={style}
      data-outcome={task.outcome_status ?? "none"}
      data-type={task.appointment_type ?? "unknown"}
    >
      <button
        type="button"
        data-status={task.status}
        data-type={task.appointment_type ?? "unknown"}
        className={className}
        title={title}
        onClick={onClick}
      >
        {children}
      </button>
      <div className={styles.outcomeFooter} aria-busy={pending}>
        <span className={styles.outcomeLabel}>
          {pending
            ? "Ergebnis wird gespeichert …"
            : result
              ? `Ergebnis: ${result.name}`
              : "Kein Ergebnisstatus"}
        </span>
        <div className={styles.outcomeActions}>
          {outcomes.map(({ value, label, short, Icon }) => {
            const selected = task.outcome_status === value;
            return (
              <button
                key={value}
                type="button"
                data-outcome={value}
                aria-label={label}
                aria-pressed={selected}
                title={
                  selected ? `${label} – erneut klicken zum Entfernen` : label
                }
                disabled={disabled || pending}
                onClick={() => onOutcome(task, selected ? null : value)}
              >
                <Icon size={13} aria-hidden="true" />
                <span className={styles.outcomeShort}>{short}</span>
                <span className={styles.outcomeFull}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
