export default function Loading() {
  return (
    <main className="grid h-dvh place-items-center bg-[var(--background)] text-[var(--text)]">
      <div className="flex items-center gap-3 text-sm font-semibold text-[var(--text-muted)]">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent)]" />
        Төслийг бэлтгэж байна…
      </div>
    </main>
  );
}
