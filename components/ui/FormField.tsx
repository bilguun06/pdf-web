import { clsx } from "clsx";
import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

export interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string;
}

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(function FormField(
  { label, hint, error, id, className, ...props },
  ref,
) {
  const fieldId = id ?? props.name;
  const messageId = fieldId ? `${fieldId}-message` : undefined;

  return (
    <label className="block" htmlFor={fieldId}>
      <span className="mb-2 block text-sm font-semibold text-[var(--text)]">{label}</span>
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error || hint ? messageId : undefined}
        className={clsx(
          "h-11 w-full rounded-xl border bg-[var(--surface)] px-3.5 text-sm text-[var(--text)] outline-none transition placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent)]/25",
          error
            ? "border-[var(--danger)] focus:border-[var(--danger)]"
            : "border-[var(--border)] focus:border-[var(--accent)]",
          className,
        )}
        {...props}
      />
      {error || hint ? (
        <span
          id={messageId}
          className={clsx(
            "mt-1.5 block text-xs leading-5",
            error ? "text-[var(--danger)]" : "text-[var(--text-muted)]",
          )}
        >
          {error ?? hint}
        </span>
      ) : null}
    </label>
  );
});
