"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/Button";

export default function SharedProjectError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid h-dvh min-w-[320px] place-items-center overflow-auto bg-[var(--background)] p-5 text-[var(--text)] sm:p-8">
      <section className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-7 text-center shadow-[var(--shadow)] sm:p-9">
        <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-[var(--danger-soft)] text-[var(--danger)]">
          <AlertTriangle aria-hidden="true" className="size-7" />
        </div>
        <h1 className="text-xl font-extrabold">Төслийг ачаалж чадсангүй</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
          Түр хүлээгээд дахин оролдоно уу.
        </p>
        <Button className="mx-auto mt-6" onClick={reset}>
          <RefreshCw aria-hidden="true" className="size-4" />
          Дахин оролдох
        </Button>
      </section>
    </main>
  );
}
