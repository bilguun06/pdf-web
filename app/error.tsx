"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid h-dvh place-items-center bg-[var(--background)] p-6 text-[var(--text)]">
      <section className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center shadow-[var(--shadow)]">
        <div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--danger-soft)] text-[var(--danger)]">
          <AlertTriangle size={24} />
        </div>
        <h1 className="text-xl font-extrabold">Аппыг нээхэд алдаа гарлаа</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
          Таны local файлууд өөрчлөгдөөгүй. Аппыг дахин ачаалаад оролдоно уу.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mx-auto mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-bold text-white transition hover:bg-[var(--accent-hover)]"
        >
          <RotateCcw size={17} />
          Дахин оролдох
        </button>
      </section>
    </main>
  );
}
