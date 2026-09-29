"use client";
import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, LockKeyhole, Target } from "lucide-react";
import { changePassword, login, updatePassword } from "@/app/login/actions";
export default function AuthForm({
  mode = "login",
  notice = "",
}: {
  mode?: "login" | "password" | "change-password";
  notice?: string;
}) {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (mode !== "login" && password !== form.get("confirm")) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }
    startTransition(async () => {
      // Redirects are framework control flow; server action redirects are handled by Next.js.
      try {
        const result =
          mode === "password"
            ? await updatePassword(password)
            : mode === "change-password"
              ? await changePassword(
                  String(form.get("current_password")),
                  password,
                )
              : await login(String(form.get("email")), password);
        if (result?.error) setError(result.error);
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
          {mode === "password" || mode === "change-password"
            ? "Dein neues Passwort."
            : "Willkommen zurück."}
        </h1>
        <p>
          {mode === "password" || mode === "change-password"
            ? "Wähle ein sicheres Passwort für deinen persönlichen Bereich."
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
          {mode === "change-password" && (
            <label>
              Bisheriges Passwort
              <input
                name="current_password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
          )}
          <label>
            {mode === "login" ? "Passwort" : "Neues Passwort"}
            <input
              name="password"
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              minLength={mode === "login" ? undefined : 12}
              maxLength={128}
              placeholder={
                mode !== "login" ? "Mindestens 12 Zeichen" : "Dein Passwort"
              }
              required
            />
          </label>
          {mode !== "login" && (
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
          <button className="primary full-width" disabled={pending}>
            {pending ? (
              "Einen Moment …"
            ) : mode !== "login" ? (
              "Passwort speichern"
            ) : (
              <>
                Anmelden <ArrowRight size={17} />
              </>
            )}
          </button>
        </form>
        {mode === "login" && (
          <div className="auth-links">
            <span>Passwort vergessen? Wende dich an deine Teamleitung.</span>
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
