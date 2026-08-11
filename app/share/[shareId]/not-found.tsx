import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function SharedProjectNotFound() {
  return (
    <main className="grid h-dvh min-w-[320px] place-items-center overflow-auto bg-[var(--background)] p-5 text-[var(--text)] sm:p-8">
      <section className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-7 text-center shadow-[var(--shadow)] sm:p-9">
        <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <FileQuestion aria-hidden="true" className="size-7" />
        </div>
        <h1 className="text-xl font-extrabold">Төсөл олдсонгүй</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
          Холбоос буруу эсвэл төсөл устгагдсан байна.
        </p>
        <Link
          href="/"
          className="mx-auto mt-6 inline-flex h-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--text)] outline-none transition hover:bg-[var(--surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          Нүүр хуудас руу буцах
        </Link>
      </section>
    </main>
  );
}
