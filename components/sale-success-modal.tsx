"use client";
import { Check } from "lucide-react";
import GoaltrackDialog from "./goaltrack-dialog";
import styles from "./sales-underwriting.module.css";
export default function SaleSuccessModal({
  name,
  onClose,
}: {
  name: string;
  onClose: () => void;
}) {
  const first = name.trim().split(/\s+/)[0];
  return (
    <GoaltrackDialog
      title={first ? `Prima gemacht, ${first}!` : "Prima gemacht!"}
      onClose={onClose}
    >
      <div className={styles.celebration}>
        <span className={styles.check}>
          <Check size={52} />
        </span>
        <div className={styles.confetti} aria-hidden="true">
          {Array.from({ length: 18 }, (_, i) => (
            <i
              key={i}
              style={{
                left: `${i * 5.5}%`,
                animationDelay: `${(i % 5) * 0.15}s`,
                background: i % 2 ? "#49dda0" : "#24bfff",
              }}
            />
          ))}
        </div>
        <h3>Weiter so!</h3>
        <p>Du hast einen neuen Sale erfolgreich eingetragen.</p>
        <button className="primary" onClick={onClose}>
          Weiter →
        </button>
      </div>
    </GoaltrackDialog>
  );
}
