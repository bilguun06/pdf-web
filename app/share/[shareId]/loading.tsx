import { LoaderCircle } from "lucide-react";

export default function SharedProjectLoading() {
  return (
    <main
      className="grid h-dvh min-w-[320px] place-items-center bg-[var(--background)] p-6 text-[var(--text)]"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <LoaderCircle
          aria-hidden="true"
          className="size-8 animate-spin text-[var(--accent)]"
        />
        <div>
          <p className="text-sm font-bold">Төслийг ачаалж байна...</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Хуваалцсан мэдээллийг бэлтгэж байна.
          </p>
        </div>
      </div>
    </main>
  );
}
