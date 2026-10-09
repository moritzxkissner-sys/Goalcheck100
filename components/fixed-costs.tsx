"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Calculator, Pencil, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { removeFixedCost, saveFixedCost } from "@/app/actions";
import {
  fixedCostBwsComparison,
  fixedCostShares,
  monthlyFixedCost,
  totalMonthlyFixedCosts,
  type Cadence,
  type FixedCost,
} from "@/lib/fixed-costs";
import { number } from "@/lib/metrics";
import { fixedCostSchema } from "@/lib/validation";

const cadenceLabels: Record<Cadence, string> = {
  monthly: "Monatlich",
  quarterly: "Vierteljährlich",
  yearly: "Jährlich",
};
const colors = [
  "#0a84ff",
  "#6a9cff",
  "#82b7ff",
  "#77a6c8",
  "#b5c3db",
  "#566b95",
];
const euro = (value: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
    value,
  );

export default function FixedCostsPanel({
  rows,
  monthlyBws,
  demo,
  userId,
  onDemoChange,
}: {
  rows: FixedCost[];
  monthlyBws: number;
  demo: boolean;
  userId: string;
  onDemoChange: (next: FixedCost[]) => void;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FixedCost | null>(null);
  const [deleting, setDeleting] = useState<FixedCost | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const monthlyTotal = totalMonthlyFixedCosts(rows);
  const shares = fixedCostShares(rows);
  const comparison = fixedCostBwsComparison(monthlyTotal, monthlyBws);
  let cursor = 0;
  const donut = shares.length
    ? `conic-gradient(${shares
        .map((share, index) => {
          const from = cursor;
          cursor += share.percent;
          return `${colors[index % colors.length]} ${from}% ${cursor}%`;
        })
        .join(", ")})`
    : "conic-gradient(#ffffff14 0% 100%)";

  function openForm(cost: FixedCost | null) {
    setEditing(cost);
    setDeleting(null);
    setError("");
    setNotice("");
    setShowForm(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = fixedCostSchema.safeParse({
      name: form.get("name"),
      amount: Number(String(form.get("amount")).replace(",", ".")),
      cadence: form.get("cadence"),
    });
    if (!parsed.success) {
      setError(
        "Bitte prüfe Name, Euro-Betrag und Turnus (max. zwei Nachkommastellen).",
      );
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        if (demo) {
          const next: FixedCost = {
            ...parsed.data,
            id: editing?.id ?? crypto.randomUUID(),
            user_id: userId,
          };
          onDemoChange(
            editing
              ? rows.map((item) => (item.id === editing.id ? next : item))
              : [...rows, next],
          );
        } else {
          const result = await saveFixedCost(parsed.data, editing?.id);
          if (result.error) {
            setError(result.error);
            return;
          }
          router.refresh();
        }
        setShowForm(false);
        setEditing(null);
        setNotice(
          editing
            ? "Fixkosten-Posten aktualisiert."
            : "Fixkosten-Posten gespeichert.",
        );
      } catch {
        setError("Keine Verbindung. Bitte versuche es erneut.");
      }
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    setError("");
    startTransition(async () => {
      try {
        if (demo) onDemoChange(rows.filter((item) => item.id !== deleting.id));
        else {
          const result = await removeFixedCost(deleting.id);
          if (result.error) {
            setError(result.error);
            return;
          }
          router.refresh();
        }
        setDeleting(null);
        setNotice("Fixkosten-Posten gelöscht.");
      } catch {
        setError("Keine Verbindung. Bitte versuche es erneut.");
      }
    });
  }

  return (
    <section className="fixed-costs-page" aria-label="Private Fixkosten">
      <div className="fixed-costs-intro glass">
        <span className="fixed-costs-icon">
          <Calculator size={24} />
        </span>
        <div>
          <strong>Dein privater Kostenplan</strong>
          <p>
            Nur du siehst und bearbeitest diese Posten. Vierteljährliche und
            jährliche Beträge werden auf einen Monat umgerechnet.
          </p>
        </div>
        <ShieldCheck size={20} className="blue" aria-label="Privat" />
      </div>

      <div className="fixed-costs-summary">
        <article className="glass fixed-costs-total">
          <span className="fixed-costs-eyebrow">FIXKOSTEN GESAMT / MONAT</span>
          <strong>{euro(monthlyTotal)}</strong>
          <p>Aus {rows.length} Posten auf Monatswerte gerechnet</p>
        </article>
        <article className="glass fixed-costs-compare">
          <span className="fixed-costs-eyebrow">
            BWS-VERGLEICH ZU FIXKOSTEN
          </span>
          <strong>
            {monthlyTotal > 0
              ? comparison.percent > 100
                ? "100 %+"
                : `${number(comparison.percent, 1)} %`
              : "–"}
          </strong>
          <p>
            {number(monthlyBws, 2)} BWS im aktuellen Monat ·{" "}
            {euro(monthlyTotal)} monatliche Fixkosten
          </p>
          <div
            className="fixed-costs-track"
            role="progressbar"
            aria-label="BWS-Vergleich zu monatlichen Fixkosten"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={comparison.visualPercent}
          >
            <i style={{ width: `${comparison.visualPercent}%` }} />
          </div>
          <small>
            {monthlyTotal === 0
              ? "Erfasse zuerst deine Fixkosten."
              : comparison.comparisonReached
                ? "Der BWS-Vergleichswert ist erreicht."
                : "Der BWS-Vergleichswert ist noch offen."}
          </small>
        </article>
      </div>
      <p className="fixed-costs-disclaimer">
        Orientierung, kein tatsächlicher Break-even: BWS sind nicht Provision
        oder verfügbares Einkommen. Euro-Kosten und BWS werden hier nur
        zahlenmäßig verglichen.
      </p>

      <div className="fixed-costs-grid">
        <article className="glass fixed-costs-chart">
          <div className="section-heading">
            <div>
              <h2>Verteilung deiner Fixkosten</h2>
              <p>Monatlicher Anteil je Posten</p>
            </div>
          </div>
          <div className="fixed-costs-donut-wrap">
            <div
              className="fixed-costs-donut"
              style={{ background: donut }}
              role="img"
              aria-label={
                shares.length
                  ? `Fixkostenverteilung: ${shares.map((s) => `${s.name} ${number(s.percent, 1)} Prozent`).join(", ")}`
                  : "Noch keine Fixkosten"
              }
            >
              <div>
                <span>pro Monat</span>
                <strong>{euro(monthlyTotal)}</strong>
              </div>
            </div>
            <div className="fixed-costs-legend">
              {shares.map((share, index) => (
                <div key={share.name}>
                  <span>
                    <i style={{ background: colors[index % colors.length] }} />
                    {share.name}
                  </span>
                  <strong>
                    {euro(share.monthlyAmount)}{" "}
                    <small>· {number(share.percent, 1)} %</small>
                  </strong>
                </div>
              ))}
              {shares.length === 0 && (
                <p>
                  Noch keine Posten vorhanden. Lege deinen ersten
                  Fixkosten-Posten an.
                </p>
              )}
            </div>
          </div>
        </article>

        <article className="glass fixed-costs-list">
          <div className="section-heading">
            <div>
              <h2>Deine Posten</h2>
              <p>Betrag und Turnus kannst du jederzeit ändern.</p>
            </div>
            <button className="primary" onClick={() => openForm(null)}>
              <Plus size={16} /> Posten hinzufügen
            </button>
          </div>
          {notice && (
            <p className="fixed-costs-notice" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {showForm && (
            <form
              className="fixed-costs-form"
              onSubmit={submit}
              key={editing?.id ?? "new"}
            >
              <div className="fixed-costs-form-title">
                <strong>
                  {editing ? "Posten bearbeiten" : "Neuer Fixkosten-Posten"}
                </strong>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Formular schließen"
                  onClick={() => {
                    setShowForm(false);
                    setError("");
                  }}
                >
                  <X size={17} />
                </button>
              </div>
              <label>
                Name der Ausgabe
                <input
                  name="name"
                  required
                  maxLength={80}
                  placeholder="z. B. Miete oder Leads"
                  defaultValue={editing?.name ?? ""}
                />
              </label>
              <div className="fixed-costs-form-row">
                <label>
                  Betrag in €
                  <input
                    name="amount"
                    required
                    inputMode="decimal"
                    type="number"
                    min="0.01"
                    max="999999999"
                    step="0.01"
                    placeholder="0,00"
                    defaultValue={editing?.amount ?? ""}
                  />
                </label>
                <label>
                  Turnus
                  <select
                    name="cadence"
                    defaultValue={editing?.cadence ?? "monthly"}
                  >
                    {Object.entries(cadenceLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button className="primary" type="submit" disabled={pending}>
                {pending
                  ? "Wird gespeichert …"
                  : editing
                    ? "Änderungen speichern"
                    : "Posten speichern"}
              </button>
            </form>
          )}
          <div className="fixed-costs-items">
            {rows.map((cost) => (
              <div className="fixed-costs-item" key={cost.id}>
                <div>
                  <strong>{cost.name}</strong>
                  <span>
                    {euro(cost.amount)} · {cadenceLabels[cost.cadence]}
                    <small>≈ {euro(monthlyFixedCost(cost))} / Monat</small>
                  </span>
                </div>
                <div className="fixed-costs-item-actions">
                  <button
                    className="icon-button"
                    aria-label={`${cost.name} bearbeiten`}
                    onClick={() => openForm(cost)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`${cost.name} löschen`}
                    onClick={() => {
                      setDeleting(cost);
                      setShowForm(false);
                      setError("");
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
            {rows.length === 0 && (
              <div className="fixed-costs-empty">
                Noch keine Fixkosten erfasst.
              </div>
            )}
          </div>
          {deleting && (
            <div className="fixed-costs-confirm">
              <p>„{deleting.name}“ wirklich löschen?</p>
              <div>
                <button
                  className="secondary"
                  onClick={() => setDeleting(null)}
                  disabled={pending}
                >
                  Abbrechen
                </button>
                <button
                  className="danger"
                  onClick={confirmDelete}
                  disabled={pending}
                >
                  Löschen bestätigen
                </button>
              </div>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
