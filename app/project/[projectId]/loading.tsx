import { LoaderCircle } from "lucide-react";

export default function CloudProjectLoading() {
  return (
    <main className="grid h-dvh min-w-[320px] place-items-center bg-[var(--background)] p-6" role="status">
      <div className="text-center text-[var(--text)]">
        <LoaderCircle className="mx-auto size-8 animate-spin text-[var(--accent)]" aria-hidden="true" />
        <p className="mt-4 text-sm font-bold">Cloud төслийг ачаалж байна…</p>
      </div>
    </main>
  );
}
