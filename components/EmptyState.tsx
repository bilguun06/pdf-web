import { FilePlus2, FolderTree, Layers3 } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface EmptyStateProps {
  onCreateDefault: () => void;
  onCreateOne: () => void;
  defaultCount?: number;
  disabled?: boolean;
}

export function EmptyState({
  onCreateDefault,
  onCreateOne,
  defaultCount = 21,
  disabled = false,
}: EmptyStateProps) {
  return (
    <section className="flex min-h-[440px] flex-1 items-center justify-center px-5 py-10 sm:px-8">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] px-6 py-10 text-center shadow-[var(--shadow)] sm:px-12 sm:py-14">
        <div
          aria-hidden="true"
          className="absolute -right-16 -top-20 size-52 rounded-full bg-[var(--accent-soft)] opacity-70 blur-2xl"
        />
        <div className="relative mx-auto mb-6 flex size-20 items-center justify-center rounded-3xl border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--accent)] shadow-sm">
          <FolderTree aria-hidden="true" className="size-9" />
          <span className="absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-xl border-4 border-[var(--surface)] bg-[var(--accent)] text-[Canvas]">
            <Layers3 aria-hidden="true" className="size-4" />
          </span>
        </div>

        <h1 className="relative text-xl font-extrabold tracking-[-0.025em] text-[var(--text)] sm:text-2xl">
          PDF бүлгүүдээ энд удирдана
        </h1>
        <p className="relative mx-auto mt-3 max-w-lg text-sm leading-6 text-[var(--text-muted)] sm:text-base sm:leading-7">
          Шинэ бүлэг үүсгээд PDF файлаа тус бүрд нь оруулна уу. Файлууд нэгдэхгүй,
          бүлэг бүр өөрийн PDF болон уншсан хуудсаа хадгална.
        </p>

        <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button variant="primary" onClick={onCreateDefault} disabled={disabled}>
            <Layers3 aria-hidden="true" className="size-4" />
            {defaultCount.toLocaleString("mn-MN")} бүлэг үүсгэх
          </Button>
          <Button variant="secondary" onClick={onCreateOne} disabled={disabled}>
            <FilePlus2 aria-hidden="true" className="size-4" />
            Шинэ бүлэг
          </Button>
        </div>
      </div>
    </section>
  );
}
