"use client";
import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, LockKeyhole, Target } from "lucide-react";
import { login, resetPassword, updatePassword } from "@/app/login/actions";
export default function AuthForm({
  mode = "login",
  notice = "",
}: {
  mode?: "login" | "password";
  notice?: string;
}) {
  const [reset, setReset] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, startTransition] = useTransition();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (mode === "password" && password !== form.get("confirm")) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }
    startTransition(async () => {
      // Redirects are framework control flow; server action redirects are handled by Next.js.
      try {
        const result =
          mode === "password"
            ? await updatePassword(password)
            : reset
              ? await resetPassword(String(form.get("email")))
              : await login(String(form.get("email")), password);
        if (result?.error) setError(result.error);
        if (result && "success" in result && result.success)
          setSuccess(result.success);
      } catch (e) {
        if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) throw e;
        setError("Keine Verbindung. Bitte versuche es erneut.");
      }
    });
  }
  return (
    <main className="auth-page">
      <section className="glass auth-card">
        <Link className="brand" href="/">
          <span className="brand-mark">
            <Target size={35} />
          </span>
          <span>
            Goal<span className="brand-light">Track</span>
            <small>SALES PERFORMANCE</small>
          </span>
        </Link>
        <h1>
          {mode === "password"
            ? "Dein neues Passwort."
            : reset
              ? "Neuer Zugang zu deinen Zielen."
              : "Willkommen zurück."}
        </h1>
        <p>
          {mode === "password"
            ? "Wähle ein sicheres Passwort für deinen persönlichen Bereich."
            : reset
              ? "Wir senden dir einen Link zum Zurücksetzen."
              : "Melde dich an und bring deine Ziele auf Kurs."}
        </p>
        {notice && <div className="auth-message">{notice}</div>}
        <form className="form" onSubmit={submit}>
          {mode === "login" && (
            <label>
              E-Mail-Adresse
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="name@agentur.de"
                required
                autoFocus
              />
            </label>
          )}
          {!reset && (
            <label>
              {mode === "password" ? "Neues Passwort" : "Passwort"}
              <input
                name="password"
                type="password"
                autoComplete={
                  mode === "password" ? "new-password" : "current-password"
                }
                minLength={mode === "password" ? 12 : undefined}
                maxLength={128}
                placeholder={
                  mode === "password"
                    ? "Mindestens 12 Zeichen"
                    : "Dein Passwort"
                }
                required
              />
            </label>
          )}
          {mode === "password" && (
            <label>
              Passwort bestätigen
              <input
                name="confirm"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </label>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="auth-message" role="status">
              {success}
            </p>
          )}
          <button className="primary full-width" disabled={pending}>
            {pending ? (
              "Einen Moment …"
            ) : mode === "password" ? (
              "Passwort speichern"
            ) : reset ? (
              "Link anfordern"
            ) : (
              <>
                Anmelden <ArrowRight size={17} />
              </>
            )}
          </button>
        </form>
        {mode === "login" && (
          <div className="auth-links">
            <button
              className="text-button"
              onClick={() => {
                setReset(!reset);
                setError("");
                setSuccess("");
              }}
            >
              {reset ? "Zurück zur Anmeldung" : "Passwort vergessen?"}
            </button>
            <a className="text-button" href="/demo">
              Demo ansehen
            </a>
          </div>
        )}
        <div className="auth-footer">
          <LockKeyhole
            size={14}
            style={{ display: "inline", marginRight: 5 }}
          />
          Dein persönlicher Teamzugang.
          <br />
          Du hast noch keinen Zugang? Wende dich an deine Teamleitung.
        </div>
      </section>
    </main>
  );
}
