"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="auth-page">
      <div className="glass auth-card">
        <h1>Daten nicht verfügbar</h1>
        <p>
          Die Verbindung konnte nicht hergestellt werden. Bitte versuche es
          erneut.
        </p>
        <button className="primary" onClick={reset}>
          Erneut versuchen
        </button>
      </div>
    </main>
  );
}
