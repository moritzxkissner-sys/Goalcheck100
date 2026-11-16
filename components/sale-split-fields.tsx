"use client";
import { useState } from "react";
import { splitBws } from "@/lib/sale-sharing";
import { number } from "@/lib/metrics";
import styles from "./sales-underwriting.module.css";
export default function SaleSplitFields({
  amount,
  partners,
  selected,
  percent = 50,
}: {
  amount: number;
  partners: { id: string; full_name: string }[];
  selected?: string | null;
  percent?: number;
}) {
  const [enabled, setEnabled] = useState(!!selected),
    [search, setSearch] = useState(""),
    [share, setShare] = useState(percent);
  const values = splitBws(Number.isFinite(amount) ? amount : 0, share);
  return (
    <fieldset className={styles.split}>
      <legend>BWS aufteilen</legend>
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        BWS mit einem Vertriebspartner teilen
      </label>
      {enabled ? (
        <>
          <label>
            Vertriebspartner suchen
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name suchen …"
            />
          </label>
          <label>
            Vertriebspartner auswählen
            <select name="partner_id" required defaultValue={selected ?? ""}>
              <option value="">Bitte auswählen</option>
              {partners
                .filter(
                  (p) =>
                    p.full_name
                      .toLocaleLowerCase("de")
                      .includes(search.toLocaleLowerCase("de")) ||
                    p.id === selected,
                )
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
            </select>
          </label>
          <div className="form-grid">
            <label>
              Eigener Anteil (%)
              <input
                name="owner_percent"
                type="number"
                min="1"
                max="99"
                step="1"
                value={share}
                onChange={(e) => setShare(Number(e.target.value))}
                required
              />
            </label>
            <label>
              Partner-Anteil (%)
              <input value={100 - share} readOnly />
            </label>
          </div>
          <p>
            Eigener BWS-Anteil: <strong>{number(values.own, 2)} BWS</strong>
            <br />
            BWS-Anteil des Partners:{" "}
            <strong>{number(values.partner, 2)} BWS</strong>
          </p>
        </>
      ) : (
        <input type="hidden" name="owner_percent" value="100" />
      )}
    </fieldset>
  );
}
