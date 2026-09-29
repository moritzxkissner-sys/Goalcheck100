"use client";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Cross,
  HeartPulse,
  House,
  LayoutDashboard,
  LogOut,
  Plus,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Trophy,
  Umbrella,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { addEntry, removeEntry, saveGoal } from "@/app/actions";
import { signOut } from "@/app/login/actions";
import {
  berlinDate,
  calculateMetrics,
  agencyMetrics,
  dailyWinners,
  categories,
  historicalCategories,
  transactionTypes,
  currentMonth,
  initials,
  monthBounds,
  monthLabel,
  number,
  rankPartners,
  type DashboardData,
  type Entry,
} from "@/lib/metrics";
import { entrySchema, goalSchema } from "@/lib/validation";
import { demoData } from "@/lib/demo";

const categoryIcons = {
  Rechtsschutz: ShieldCheck,
  Kfz: Car,
  Haftpflicht: Umbrella,
  Hausrat: House,
  Wohngebäude: House,
  Unfall: Cross,
  Krankenversicherung: HeartPulse,
  Sonstiges: Wallet,
};
const categoryColors = [
  "#428cff",
  "#a58aff",
  "#52b8ed",
  "#e8ad61",
  "#6bc6b0",
  "#ed8298",
  "#7286ee",
  "#969ba8",
];
type View = "overview" | "entries" | "team";

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal glass"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-header">
        <h2 id="modal-title">{title}</h2>
        <button
          className="icon-button"
          aria-label="Schließen"
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

function ProgressChart({
  entries,
  target,
  month,
}: {
  entries: Entry[];
  target: number;
  month: string;
}) {
  const { days } = monthBounds(month);
  const today = berlinDate();
  const lastDay =
    month === today.slice(0, 7)
      ? Number(today.slice(8))
      : month < today.slice(0, 7)
        ? days
        : 0;
  const max = Math.max(
    target * 1.15,
    calculateMetrics(entries, target, month).total * 1.15,
    1,
  );
  const cumulative = Array.from({ length: lastDay + 1 }, (_, i) =>
    entries
      .filter((e) => Number(e.occurred_on.slice(8)) <= i)
      .reduce((s, e) => s + e.amount, 0),
  );
  const points = cumulative.map(
    (v, i) => `${40 + (i / days) * 620},${170 - (v / max) * 140}`,
  );
  const targetY = 170 - (target / max) * 140;
  return (
    <div className="chart">
      <svg
        viewBox="0 0 690 215"
        role="img"
        aria-label={`Kumulierte BWS im ${monthLabel(month)}: ${number(cumulative.at(-1) ?? 0, 2)} von ${number(target, 2)} BWS`}
      >
        <defs>
          <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2b85ff" stopOpacity=".26" />
            <stop offset="100%" stopColor="#2b85ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <line
              x1="40"
              x2="660"
              y1={30 + i * 47}
              y2={30 + i * 47}
              stroke="#ffffff"
              strokeOpacity=".055"
            />
            <text
              x="29"
              y={34 + i * 47}
              textAnchor="end"
              fill="#757c8c"
              fontSize="11"
            >
              {number((max * (3 - i)) / 3 / 1000, 1)}k
            </text>
          </g>
        ))}
        <line
          x1="40"
          x2="660"
          y1={targetY}
          y2={targetY}
          stroke="#62728b"
          strokeDasharray="5 6"
        />
        <text
          x="660"
          y={targetY - 9}
          textAnchor="end"
          fill="#8c97a9"
          fontSize="11"
        >
          Monatsziel
        </text>
        {points.length > 1 && (
          <>
            <path
              d={`M ${points.join(" L ")} L ${40 + (lastDay / days) * 620},170 L 40,170 Z`}
              fill="url(#chart-fill)"
            />
            <polyline
              points={points.join(" ")}
              fill="none"
              stroke="#428dff"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <circle
              cx={40 + (lastDay / days) * 620}
              cy={170 - ((cumulative.at(-1) ?? 0) / max) * 140}
              r="4.5"
              fill="#7ab0ff"
              stroke="#172a47"
              strokeWidth="4"
            />
          </>
        )}
        {[1, 5, 10, 15, 20, 25, days].map((d) => (
          <text
            key={d}
            x={40 + (d / days) * 620}
            y="202"
            textAnchor="middle"
            fill="#757c8c"
            fontSize="11"
          >
            {String(d).padStart(2, "0")}
          </text>
        ))}
      </svg>
    </div>
  );
}

export default function Dashboard({
  initial,
  demo = false,
}: {
  initial: DashboardData;
  demo?: boolean;
}) {
  const router = useRouter();
  const [demoState, setData] = useState(initial);
  const data = demo ? demoState : initial;
  const [view, setView] = useState<View>("overview");
  const [modal, setModal] = useState<
    "entry" | "goal" | "help" | "account" | null
  >(null);
  const [deleting, setDeleting] = useState<Entry | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState("Alle");
  const entryId = useRef("");
  useEffect(() => {
    if (demo) return;
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, demo]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 5000);
    return () => clearTimeout(timer);
  }, [message]);
  const metrics = calculateMetrics(data.entries, data.target, data.month);
  const partners = rankPartners(
    data.partners.map((p) =>
      p.user_id === data.userId
        ? {
            ...p,
            total: metrics.total,
            target: data.target,
            entry_count: metrics.count,
          }
        : p,
    ),
  );
  const agency = agencyMetrics(partners);
  const teamTotal = agency.total;
  const winners = dailyWinners(data.daily.partners);
  const winnerIds = new Set(winners.map((p) => p.user_id));
  const visibleCategories = historicalCategories.filter(
    (c) => c !== "Kfz" || data.entries.some((e) => e.category === "Kfz"),
  );
  const rank = partners.findIndex((p) => p.user_id === data.userId) + 1;
  const shownEntries = data.entries.filter(
    (e) => filter === "Alle" || e.category === filter,
  );
  const openEntry = () => {
    entryId.current = crypto.randomUUID();
    setError("");
    setModal("entry");
  };
  const close = () => {
    if (!pending) {
      setModal(null);
      setDeleting(null);
      setError("");
    }
  };
  const changeMonth = (direction: number) => {
    const d = new Date(`${data.month}-01T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + direction);
    const month = d.toISOString().slice(0, 7);
    if (demo) {
      setData(demoData(month));
      setMessage("Demo-Monat mit Beispieldaten geöffnet.");
    } else router.push(`/?month=${month}`, { scroll: false });
  };
  function handleEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const input = {
      id: entryId.current,
      amount: Number(String(form.get("amount")).replace(",", ".")),
      category: form.get("category"),
      transaction_type: form.get("transaction_type"),
      occurred_on: form.get("occurred_on"),
      note: form.get("note"),
    };
    const parsed = entrySchema.safeParse(input);
    if (!parsed.success || String(input.occurred_on) > berlinDate()) {
      setError(
        "Bitte prüfe Betrag und Datum. Zukünftige Einträge sind nicht möglich.",
      );
      return;
    }
    startTransition(async () => {
      try {
        if (!demo) {
          const result = await addEntry(parsed.data);
          if (result.error) {
            setError(result.error);
            return;
          }
        }
        if (demo)
          setData((old) => ({
            ...old,
            entries: parsed.data.occurred_on.startsWith(old.month)
              ? [{ ...parsed.data, user_id: old.userId }, ...old.entries].sort(
                  (a, b) => b.occurred_on.localeCompare(a.occurred_on),
                )
              : old.entries,
            daily: {
              ...old.daily,
              partners: old.daily.partners.map((p) =>
                p.user_id === old.userId &&
                parsed.data.occurred_on === old.daily.date
                  ? {
                      ...p,
                      total:
                        Math.round((p.total + parsed.data.amount) * 100) / 100,
                    }
                  : p,
              ),
            },
          }));
        setModal(null);
        setMessage(
          "BWS gespeichert. Dein Fortschritt und die Teamwertung sind aktualisiert.",
        );
        if (!demo) router.refresh();
      } catch {
        setError("Keine Verbindung. Bitte versuche es erneut.");
      }
    });
  }
  function handleGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const input = {
      month: data.month,
      target: Number(
        String(new FormData(event.currentTarget).get("target")).replace(
          ",",
          ".",
        ),
      ),
    };
    if (!goalSchema.safeParse(input).success) {
      setError("Bitte gib ein gültiges Ziel größer als 0 ein.");
      return;
    }
    startTransition(async () => {
      try {
        if (!demo) {
          const result = await saveGoal(input);
          if (result.error) {
            setError(result.error);
            return;
          }
        }
        if (demo) setData((old) => ({ ...old, target: input.target }));
        setModal(null);
        setMessage("Dein Monatsziel wurde gespeichert.");
        if (!demo) router.refresh();
      } catch {
        setError("Keine Verbindung. Bitte versuche es erneut.");
      }
    });
  }
  function handleDelete() {
    if (!deleting) return;
    const id = deleting.id;
    startTransition(async () => {
      try {
        if (!demo) {
          const result = await removeEntry(id);
          if (result.error) {
            setError(result.error);
            return;
          }
        }
        if (demo)
          setData((old) => ({
            ...old,
            entries: old.entries.filter((e) => e.id !== id),
            daily: {
              ...old.daily,
              partners: old.daily.partners.map((p) =>
                p.user_id === old.userId &&
                deleting.occurred_on === old.daily.date
                  ? {
                      ...p,
                      total:
                        Math.round((p.total - deleting.amount) * 100) / 100,
                    }
                  : p,
              ),
            },
          }));
        setDeleting(null);
        setMessage("Eintrag gelöscht. Die BWS-Werte wurden aktualisiert.");
        if (!demo) router.refresh();
      } catch {
        setError("Keine Verbindung. Bitte versuche es erneut.");
      }
    });
  }
  const nav = [
    { id: "overview" as const, label: "Übersicht", icon: LayoutDashboard },
    { id: "entries" as const, label: "Meine Einträge", icon: Wallet },
    { id: "team" as const, label: "Team", icon: Users },
  ];
  const teamTable = (compact = false) => (
    <div className="team-table" role="table" aria-label="Team-Rangliste">
      <div className="team-row table-head" role="row">
        <span role="columnheader">Rang</span>
        <span role="columnheader">Vertriebspartner</span>
        <span role="columnheader">BWS gesamt</span>
        <span role="columnheader">Ziel erreicht</span>
      </div>
      {partners.slice(0, compact ? 4 : undefined).map((p, i) => (
        <div
          className={`team-row ${p.user_id === data.userId ? "is-you" : ""}`}
          role="row"
          key={p.user_id}
        >
          <span className={`rank rank-${i}`} role="cell">
            {i === 0 ? <Trophy size={16} /> : String(i + 1).padStart(2, "0")}
          </span>
          <div className="partner" role="cell">
            <span className={`avatar avatar-${i % 4}`}>
              {initials(p.full_name)}
            </span>
            <span>
              {p.full_name}
              {p.user_id === data.userId && <em>Du</em>}
              {winnerIds.has(p.user_id) && (
                <span
                  className="daily-badge"
                  title={`Tagessieg am ${data.daily.date} · aktueller Stand`}
                >
                  <Trophy size={12} /> Tagessieg
                </span>
              )}
            </span>
          </div>
          <strong role="cell">
            {number(p.total, 2)}
            <small> BWS</small>
          </strong>
          <div className="table-progress" role="cell">
            <span>{number((p.total / p.target) * 100, 1)} %</span>
            <div className="track">
              <i
                style={{
                  width: `${Math.min(100, (p.total / p.target) * 100)}%`,
                }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href={demo ? "/demo" : "/"}>
          <span className="brand-mark">
            <Target size={27} strokeWidth={2.2} />
          </span>
          <span>
            Goal<span className="brand-light">Track</span>
            <small>SALES PERFORMANCE</small>
          </span>
        </a>
        <div className="workspace-label">DEIN WORKSPACE</div>
        <nav aria-label="Hauptnavigation">
          {nav.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              onClick={() => setView(item.id)}
              aria-current={view === item.id ? "page" : undefined}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
              {item.id === "team" && (
                <span className="nav-count">{partners.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="team-note">
            <span className="mini-target">
              <Target size={19} />
            </span>
            <strong>Gemeinsam mehr erreichen.</strong>
            <p>Jeder Abschluss zählt.</p>
          </div>
          <button className="nav-item" onClick={() => setModal("help")}>
            <CircleHelp size={19} />
            Hilfe & Informationen
          </button>
          <div className="account">
            <span className="avatar">{initials(data.name)}</span>
            <div>
              <strong>{data.name}</strong>
              <small>Vertriebspartner</small>
            </div>
            <form action={signOut}>
              <button
                className="icon-button"
                aria-label={demo ? "Zur Anmeldung" : "Abmelden"}
              >
                <LogOut size={17} />
              </button>
            </form>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar backdrop-blur-xl">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <strong>{nav.find((n) => n.id === view)?.label}</strong>
          </div>
          <a className="mobile-brand" href={demo ? "/demo" : "/"}>
            <Target size={24} />
            Goal Track
          </a>
          <div className="topbar-right">
            <span className="private-label">
              <ShieldCheck size={15} />
              Dein persönlicher Bereich
            </span>
            <button
              className="avatar small-avatar"
              aria-label="Mein Konto"
              onClick={() => setModal("account")}
            >
              {initials(data.name)}
            </button>
          </div>
        </header>
        <main>
          {demo && (
            <div className="demo-banner">
              <span>
                <Sparkles size={14} />
                <strong>Demo-Modus</strong>
                <span>
                  Beispieldaten · Änderungen gelten nur bis zum Neuladen.
                </span>
              </span>
              <a href="/login">
                Anmelden <ArrowUpRight size={14} />
              </a>
            </div>
          )}
          <section className="page-heading">
            <div>
              <div className="eyebrow">
                {view === "team"
                  ? "GEMEINSAM ERFOLGREICH"
                  : "DEINE PERFORMANCE IM BLICK"}
              </div>
              <h1>
                {view === "overview" ? (
                  <>
                    Auf Kurs, {data.name.split(" ")[0]}
                    <span className="blue">.</span>
                  </>
                ) : view === "entries" ? (
                  "Meine Einträge"
                ) : (
                  "Unser Team"
                )}
              </h1>
              <p>
                {view === "overview"
                  ? "Deine Ziele. Dein Fortschritt. Jeder Abschluss zählt."
                  : view === "entries"
                    ? "Alle deine Abschlüsse, an einem Ort."
                    : "Gemeinsame Ziele. Individuelle Erfolge."}
              </p>
            </div>
            <div className="heading-actions">
              <div className="month-switch">
                <button
                  aria-label="Vorheriger Monat"
                  onClick={() => changeMonth(-1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <span>
                  <CalendarDays size={15} />
                  {monthLabel(data.month)}
                </span>
                <button
                  aria-label="Nächster Monat"
                  disabled={data.month >= currentMonth()}
                  onClick={() => changeMonth(1)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <button className="primary add-button" onClick={openEntry}>
                <Plus size={18} />
                BWS hinzufügen
              </button>
            </div>
          </section>

          {view === "overview" && (
            <>
              <section className="metrics-grid" aria-label="Monatskennzahlen">
                <article className="metric glass">
                  <div className="metric-label">
                    BWS Gesamt{" "}
                    <span className="metric-icon">
                      <Wallet size={18} />
                    </span>
                  </div>
                  <div className="metric-value" data-testid="total-bws">
                    {number(metrics.total, 2)}
                    <span>BWS</span>
                  </div>
                  <div className="metric-foot">
                    <span className="blue">
                      <ArrowUpRight size={14} />
                      {metrics.count} Abschlüsse
                    </span>
                    <span>diesen Monat</span>
                  </div>
                </article>
                <article className="metric glass">
                  <div className="metric-label">
                    Monatsziel{" "}
                    <span className="metric-icon">
                      <Target size={18} />
                    </span>
                  </div>
                  <div className="metric-value">
                    {number(data.target, 2)}
                    <span>BWS</span>
                  </div>
                  <button
                    className="text-button metric-foot"
                    onClick={() => {
                      setError("");
                      setModal("goal");
                    }}
                  >
                    Monatsziel anpassen <ArrowUpRight size={14} />
                  </button>
                </article>
                <article className="metric glass">
                  <div className="metric-label">
                    Noch offen{" "}
                    <span className="metric-icon">
                      <ArrowDownLeft size={18} />
                    </span>
                  </div>
                  <div className="metric-value">
                    {number(metrics.remaining, 2)}
                    <span>BWS</span>
                  </div>
                  <div className="metric-foot">
                    {metrics.remaining === 0 ? (
                      <span className="green">Monatsziel erreicht!</span>
                    ) : (
                      <span>Bis zu deinem Monatsziel</span>
                    )}
                  </div>
                </article>
                <article className="metric glass forecast-metric">
                  <div className="metric-label">
                    Prognose{" "}
                    <span className="metric-icon">
                      <TrendingUp size={18} />
                    </span>
                  </div>
                  <div className="metric-value">
                    {number(metrics.forecastPercent, 1)}
                    <span>%</span>
                  </div>
                  <div className="metric-foot">
                    <span className="blue">{number(metrics.forecast)} BWS</span>
                    <span>zum Monatsende</span>
                  </div>
                </article>
              </section>
              <section className="performance-grid">
                <article className="glass goal-card">
                  <div className="section-heading">
                    <h2>Dein Monatsziel</h2>
                    <span className="pill">
                      {metrics.progress >= 100 ? "Ziel erreicht" : "In Arbeit"}
                    </span>
                  </div>
                  <div className="ring-wrap">
                    <svg
                      className="progress-ring"
                      viewBox="0 0 210 210"
                      aria-hidden="true"
                    >
                      <defs>
                        <linearGradient
                          id="ring-gradient"
                          x1="0"
                          y1="1"
                          x2="1"
                          y2="0"
                        >
                          <stop stopColor="#235eff" />
                          <stop offset="1" stopColor="#70bbff" />
                        </linearGradient>
                      </defs>
                      <circle
                        cx="105"
                        cy="105"
                        r="88"
                        fill="none"
                        stroke="#ffffff0b"
                        strokeWidth="12"
                      />
                      <circle
                        cx="105"
                        cy="105"
                        r="88"
                        fill="none"
                        stroke="url(#ring-gradient)"
                        strokeWidth="12"
                        strokeLinecap="round"
                        strokeDasharray={`${(Math.min(100, metrics.progress) / 100) * 553} 553`}
                        transform="rotate(-90 105 105)"
                      />
                    </svg>
                    <div className="ring-content">
                      <Target size={22} />
                      <strong>
                        {number(metrics.progress, 1)}
                        <span>%</span>
                      </strong>
                      <span>vom Ziel erreicht</span>
                    </div>
                  </div>
                  <div className="goal-summary">
                    <strong>
                      {number(metrics.total, 2)}{" "}
                      <span>/ {number(data.target, 2)} BWS</span>
                    </strong>
                    <div className="goal-message">
                      <span className="mini-target">
                        <Activity size={17} />
                      </span>
                      <p>
                        {metrics.remaining === 0 ? (
                          "Stark! Du hast dein Monatsziel erreicht."
                        ) : data.month < currentMonth() ? (
                          "Dieser Monat ist abgeschlossen."
                        ) : (
                          <>
                            Noch{" "}
                            <strong>{number(metrics.dailyNeeded)} BWS</strong>{" "}
                            {metrics.elapsed === metrics.days
                              ? "heute"
                              : "pro verbleibendem Tag"}{" "}
                            bis zum Ziel.
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                </article>
                <article className="glass trend-card">
                  <div className="section-heading">
                    <div>
                      <h2>Deine Entwicklung</h2>
                      <p>Kumulierte BWS im Monatsverlauf</p>
                    </div>
                    <span className="chart-legend">
                      <i />
                      BWS Gesamt
                    </span>
                  </div>
                  <div className="chart-value">
                    {number(metrics.total, 2)} <span>BWS</span>
                    <span className="chart-badge">
                      {number(metrics.progress, 1)} % erreicht
                    </span>
                  </div>
                  <ProgressChart
                    entries={data.entries}
                    target={data.target}
                    month={data.month}
                  />
                  <div className="chart-footer">
                    <span>
                      <span className="tiny-dot" />
                      {monthLabel(data.month)}
                    </span>
                    <span>Ziel: {number(data.target)} BWS</span>
                  </div>
                </article>
              </section>
              <section className="bottom-grid">
                <article className="glass team-card">
                  <div className="section-heading">
                    <div>
                      <h2>
                        Team Performance{" "}
                        <span className="count-pill">{partners.length}</span>
                      </h2>
                      <p>Gemeinsam auf Erfolgskurs.</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setView("team")}
                    >
                      Alle ansehen <ChevronRight size={15} />
                    </button>
                  </div>
                  {teamTable(true)}
                  <div className="team-footer">
                    <span>
                      <Trophy size={15} />
                      Deine Platzierung
                    </span>
                    <strong>
                      Platz {rank} <span>von {partners.length}</span>
                    </strong>
                  </div>
                </article>
                <article className="glass category-card">
                  <div className="section-heading">
                    <div>
                      <h2>Dein Produktmix</h2>
                      <p>BWS nach Versicherung</p>
                    </div>
                    <ShieldCheck size={19} className="muted" />
                  </div>
                  <div className="category-stack">
                    {visibleCategories.map((c, i) => {
                      const value = data.entries
                        .filter((e) => e.category === c)
                        .reduce((s, e) => s + e.amount, 0);
                      return value > 0 ? (
                        <i
                          key={c}
                          style={{
                            width: `${(value / metrics.total) * 100}%`,
                            background: categoryColors[i],
                          }}
                          title={`${c}: ${number(value)} BWS`}
                        />
                      ) : null;
                    })}
                  </div>
                  <div className="category-list">
                    {visibleCategories
                      .map((c, i) => ({
                        c,
                        i,
                        value: data.entries
                          .filter((e) => e.category === c)
                          .reduce((s, e) => s + e.amount, 0),
                      }))
                      .filter((c) => c.value > 0)
                      .sort((a, b) => b.value - a.value)
                      .map(({ c, i, value }) => (
                        <div key={c}>
                          <span>
                            <i style={{ background: categoryColors[i] }} />
                            {c}
                          </span>
                          <strong>
                            {number(value, 2)} <small>BWS</small>
                          </strong>
                        </div>
                      ))}
                    {metrics.total === 0 && (
                      <p className="empty-copy">
                        Dein Produktmix erscheint nach deinem ersten Eintrag.
                      </p>
                    )}
                  </div>
                </article>
              </section>
            </>
          )}

          {view === "entries" && (
            <article className="glass entries-card">
              <div className="section-heading">
                <div>
                  <h2>
                    Deine Abschlüsse{" "}
                    <span className="count-pill">{shownEntries.length}</span>
                  </h2>
                  <p>Nur du kannst deine einzelnen Einträge sehen.</p>
                </div>
                <select
                  aria-label="Nach Versicherung filtern"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option>Alle</option>
                  {visibleCategories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="entry-list">
                {shownEntries.map((entry) => {
                  const Icon = categoryIcons[entry.category];
                  return (
                    <div className="entry-row" key={entry.id}>
                      <span className="entry-icon">
                        <Icon size={21} />
                      </span>
                      <div className="entry-info">
                        <strong>{entry.category}</strong>
                        <span>
                          {entry.transaction_type ??
                            "Altbestand · Vertragsart nicht erfasst"}{" "}
                          ·{" "}
                          {new Intl.DateTimeFormat("de-DE", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          }).format(new Date(entry.occurred_on + "T12:00:00"))}
                          {entry.note && <> · {entry.note}</>}
                        </span>
                      </div>
                      <strong className="entry-amount">
                        +{number(entry.amount, 2)} <small>BWS</small>
                      </strong>
                      <button
                        className="icon-button delete-button"
                        aria-label={`${entry.category} vom ${entry.occurred_on} löschen`}
                        onClick={() => {
                          setError("");
                          setDeleting(entry);
                        }}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  );
                })}
                {shownEntries.length === 0 && (
                  <div className="empty-state">
                    <Wallet size={34} />
                    <h3>Noch keine Einträge</h3>
                    <p>
                      {filter === "Alle"
                        ? "Erfasse deinen ersten Abschluss für diesen Monat."
                        : "Für diese Versicherung gibt es noch keine Einträge."}
                    </p>
                    <button className="primary" onClick={openEntry}>
                      <Plus size={17} />
                      BWS hinzufügen
                    </button>
                  </div>
                )}
              </div>
            </article>
          )}

          {view === "team" && (
            <>
              <section
                className="team-performance-grid"
                aria-label="Teamziele und Tagessieg"
              >
                <article
                  className="glass performance-card agency-card"
                  data-testid="agency-goal"
                >
                  <div className="section-heading">
                    <div>
                      <h2>Monatsziel der Agentur</h2>
                      <p>
                        {monthLabel(data.month)} · {partners.length} aktive
                        Partner
                      </p>
                    </div>
                    <Target size={23} className="blue" />
                  </div>
                  <div className="performance-value">
                    {number(agency.total, 2)}{" "}
                    <span>/ {number(agency.target, 2)} BWS</span>
                  </div>
                  <div
                    className="track agency-progress"
                    role="progressbar"
                    aria-label="Agenturziel erreicht"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.min(100, agency.progress)}
                    aria-valuetext={`${number(agency.progress, 1)} Prozent erreicht`}
                  >
                    <i
                      style={{ width: `${Math.min(100, agency.progress)}%` }}
                    />
                  </div>
                  <div className="performance-caption">
                    <strong>{number(agency.progress, 1)} % erreicht</strong>
                    <span>
                      {agency.remaining === 0 && agency.target > 0
                        ? "Gemeinsam das Ziel erreicht!"
                        : `Noch ${number(agency.remaining, 2)} BWS`}
                    </span>
                  </div>
                  <p className="performance-note">
                    Summe aller persönlichen Monatsziele.
                  </p>
                </article>
                <article
                  className="glass performance-card daily-card"
                  data-testid="daily-winner"
                >
                  <div className="section-heading">
                    <div>
                      <h2>Tagessieg</h2>
                      <p>
                        {new Intl.DateTimeFormat("de-DE", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                          timeZone: "UTC",
                        }).format(
                          new Date(`${data.daily.date}T12:00:00Z`),
                        )}{" "}
                        · Berlin
                      </p>
                    </div>
                    <Trophy size={23} className="blue" />
                  </div>
                  {winners.length > 0 ? (
                    <>
                      <div className="daily-names">
                        {winners.map((p) => p.full_name).join(" · ")}
                      </div>
                      <div className="performance-value">
                        {number(winners[0].total, 2)}{" "}
                        <span>
                          BWS {winners.length > 1 ? "je Partner" : "heute"}
                        </span>
                      </div>
                      <p className="performance-note">
                        {winners.length > 1
                          ? "Gemeinsam auf Platz 1"
                          : "Heute auf Platz 1"}{" "}
                        · aktueller Stand
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="daily-names">Heute ist alles offen.</div>
                      <p className="performance-note">
                        Noch keine BWS für heute erfasst.
                      </p>
                    </>
                  )}
                  <p className="performance-note">
                    Nach Abschlussdatum · täglich neu ab 00:00 Uhr.
                  </p>
                </article>
              </section>
              <section className="team-summary-grid">
                <article className="metric glass">
                  <div className="metric-label">
                    Team BWS Gesamt <Users size={18} />
                  </div>
                  <div className="metric-value">
                    {number(teamTotal, 2)}
                    <span>BWS</span>
                  </div>
                  <div className="metric-foot">{monthLabel(data.month)}</div>
                </article>
                <article className="metric glass">
                  <div className="metric-label">
                    Deine Platzierung <Trophy size={18} />
                  </div>
                  <div className="metric-value">
                    {rank}
                    <span>/ {partners.length}</span>
                  </div>
                  <div className="metric-foot">Sortiert nach erzielten BWS</div>
                </article>
                <article className="metric glass">
                  <div className="metric-label">
                    Team Abschlüsse <ShieldCheck size={18} />
                  </div>
                  <div className="metric-value">
                    {partners.reduce((s, p) => s + p.entry_count, 0)}
                  </div>
                  <div className="metric-foot">Jeder Abschluss zählt.</div>
                </article>
              </section>
              <article className="glass team-card full-team">
                <div className="section-heading">
                  <div>
                    <h2>
                      Vertriebspartner{" "}
                      <span className="count-pill">{partners.length}</span>
                    </h2>
                    <p>Unsere Performance im {monthLabel(data.month)}.</p>
                  </div>
                  <span className="pill">
                    {demo ? "Beispieldaten" : "Alle 15 Sek. aktualisiert"}
                  </span>
                </div>
                {teamTable()}
              </article>
            </>
          )}
          <footer className="page-footer">
            <span>
              <Target size={14} />
              Goal Track <span className="footer-divider">/</span> Gemeinsam
              Ziele erreichen.
            </span>
            <span>
              {demo
                ? "Interaktive Vorschau"
                : "Teamwerte werden automatisch aktualisiert"}
            </span>
          </footer>
        </main>
      </div>
      <nav
        className="mobile-nav backdrop-blur-xl"
        aria-label="Mobile Navigation"
      >
        {nav.map((item) => (
          <button
            key={item.id}
            className={view === item.id ? "active" : ""}
            onClick={() => setView(item.id)}
            aria-current={view === item.id ? "page" : undefined}
          >
            <item.icon size={21} />
            <span>{item.label}</span>
          </button>
        ))}
        <button onClick={openEntry}>
          <Plus size={23} />
          <span>Erfassen</span>
        </button>
      </nav>
      {message && (
        <div className="toast glass" role="status">
          <Check size={19} />
          {message}
          <button
            className="icon-button"
            aria-label="Meldung schließen"
            onClick={() => setMessage("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal === "entry" && (
        <Modal title="BWS hinzufügen" onClose={close}>
          <p className="modal-description">
            Ein neuer Abschluss. Ein Schritt näher an dein Ziel.
          </p>
          <form onSubmit={handleEntry} className="form">
            <label>
              Versicherung
              <select name="category" defaultValue="Rechtsschutz">
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Vertragsart
              <select
                name="transaction_type"
                defaultValue="Neuvertrag"
                required
              >
                {transactionTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                BWS
                <input
                  autoFocus
                  name="amount"
                  type="text"
                  inputMode="decimal"
                  required
                  placeholder="z. B. 1250"
                  pattern="[0-9]+([.,][0-9]{1,2})?"
                  title="Betrag ohne Tausenderpunkte, z. B. 1250 oder 1250,50"
                />
              </label>
              <label>
                Abschlussdatum
                <input
                  name="occurred_on"
                  type="date"
                  required
                  min="2000-01-01"
                  max={berlinDate()}
                  defaultValue={
                    data.month === currentMonth()
                      ? berlinDate()
                      : `${data.month}-01`
                  }
                />
              </label>
            </div>
            <label>
              Notiz <span className="optional">optional</span>
              <input
                name="note"
                maxLength={160}
                placeholder="z. B. Vertragsverlängerung"
              />
            </label>
            <p className="form-hint">
              <ShieldCheck size={14} />
              Bitte keine Kunden- oder Vertragsdaten eintragen.
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary full-width" disabled={pending}>
              {pending ? (
                "Wird gespeichert …"
              ) : (
                <>
                  <Plus size={18} />
                  BWS hinzufügen
                </>
              )}
            </button>
          </form>
        </Modal>
      )}
      {modal === "goal" && (
        <Modal title="Dein Monatsziel" onClose={close}>
          <p className="modal-description">
            Setze dein BWS-Ziel für {monthLabel(data.month)}.
          </p>
          <form className="form" onSubmit={handleGoal}>
            <label>
              Monatsziel in BWS
              <input
                autoFocus
                name="target"
                inputMode="decimal"
                required
                defaultValue={data.target}
                pattern="[0-9]+([.,][0-9]{1,2})?"
              />
            </label>
            <div className="goal-presets">
              {[10000, 15000, 25000].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={(e) => {
                    const input = e.currentTarget.form?.elements.namedItem(
                      "target",
                    ) as HTMLInputElement;
                    if (input) input.value = String(v);
                  }}
                >
                  {number(v)}
                </button>
              ))}
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary full-width" disabled={pending}>
              {pending ? "Wird gespeichert …" : "Monatsziel speichern"}
            </button>
          </form>
        </Modal>
      )}
      {modal === "help" && (
        <Modal title="Gut zu wissen" onClose={close}>
          <div className="help-content">
            <h3>Dein Fortschritt</h3>
            <p>
              Erzielte BWS geteilt durch dein Monatsziel. „Noch offen“ wird bei
              Übererfüllung 0.
            </p>
            <h3>Deine Prognose</h3>
            <p>
              BWS pro vergangenem Kalendertag × Tage im Monat. Die Prozentzahl
              zeigt die erwartete Zielerreichung. Maßgeblich ist die Zeitzone
              Europe/Berlin.
            </p>
            <h3>Dein Team</h3>
            <p>
              Deine Einzelabschlüsse bleiben privat. Das Team sieht Namen,
              Monatsziele und aggregierte BWS. Die Rangliste wird alle 15
              Sekunden und nach deinen Änderungen aktualisiert.
            </p>
            <h3>Agenturziel & Tagessieg</h3>
            <p>
              Das Agenturziel ist die Summe der Monatsziele aller aktiven
              Partner. Ohne eigenes Monatsziel zählen pro Partner 10.000 BWS.
              Der Tagessieg zeigt die höchsten BWS mit dem heutigen
              Abschlussdatum in Berlin, unabhängig vom ausgewählten Monat. Bei
              Gleichstand teilen sich die Führenden den Tagessieg. Der Stand
              wird bis Tagesende laufend aktualisiert.
            </p>
            <h3>Dein Zugang</h3>
            <p>
              Deine Teamleitung lädt dich ein. Ein neues Passwort kannst du über
              die Anmeldung anfordern.
            </p>
            {demo && (
              <p className="blue">
                Du nutzt Beispieldaten. Demo-Änderungen werden nicht dauerhaft
                gespeichert.
              </p>
            )}
          </div>
        </Modal>
      )}
      {modal === "account" && (
        <Modal title="Mein Konto" onClose={close}>
          <div className="help-content">
            <h3>{data.name}</h3>
            <p>{data.email}</p>
            <button className="secondary" onClick={() => setModal("help")}>
              Hilfe & Informationen
            </button>
            <form action={signOut}>
              <button className="primary full-width">
                <LogOut size={17} />
                {demo ? "Zur Anmeldung" : "Abmelden"}
              </button>
            </form>
          </div>
        </Modal>
      )}
      {deleting && (
        <Modal title="Eintrag löschen?" onClose={close}>
          <p className="modal-description">
            {deleting.category} · {number(deleting.amount, 2)} BWS. Dieser
            Eintrag wird dauerhaft entfernt und deine BWS-Werte werden neu
            berechnet.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button className="secondary" disabled={pending} onClick={close}>
              Abbrechen
            </button>
            <button
              className="danger"
              disabled={pending}
              onClick={handleDelete}
            >
              {pending ? "Wird gelöscht …" : "Eintrag löschen"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
