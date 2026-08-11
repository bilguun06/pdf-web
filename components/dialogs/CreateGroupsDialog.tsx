"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";

export interface CreateGroupsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (count: number) => void | Promise<void>;
  initialCount?: number;
  maxCount?: number;
  loading?: boolean;
}

function CreateGroupsForm({
  onOpenChange,
  onCreate,
  initialCount = 21,
  maxCount,
  loading = false,
}: Omit<CreateGroupsDialogProps, "open">) {
  const formId = useId();
  const [count, setCount] = useState(String(initialCount));
  const [countError, setCountError] = useState<string>();
  const [submitError, setSubmitError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const busy = loading || submitting;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedCount = Number(count);
    const valid =
      Number.isSafeInteger(parsedCount) &&
      parsedCount >= 1 &&
      (maxCount === undefined || parsedCount <= maxCount);
    setCountError(
      valid
        ? undefined
        : maxCount === undefined
          ? "1 буюу түүнээс их бүхэл тоо оруулна уу."
          : `1-${maxCount.toLocaleString("mn-MN")} хооронд бүхэл тоо оруулна уу.`,
    );
    setSubmitError(undefined);
    if (!valid) return;

    setSubmitting(true);
    try {
      await onCreate(parsedCount);
      onOpenChange(false);
    } catch (reason) {
      setSubmitError(
        reason instanceof Error && reason.message
          ? reason.message
          : "Бүлгүүдийг үүсгэж чадсангүй.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title="Бүлэг үүсгэх"
      description="Хэдэн хоосон PDF бүлэг нэг дор үүсгэхээ оруулна уу."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Болих
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={busy}>
            Үүсгэх
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit}>
        <FormField
          autoFocus
          name="groupCount"
          type="number"
          inputMode="numeric"
          min={1}
          max={maxCount}
          step={1}
          label="Хэдэн бүлэг үүсгэх вэ?"
          value={count}
          disabled={busy}
          onChange={(event) => {
            setCount(event.target.value);
            if (countError) setCountError(undefined);
          }}
          error={countError}
          hint={
            maxCount === undefined
              ? "Жишээ нь 21 гэж оруулбал 21 тусдаа бүлэг үүснэ."
              : `Одоо хамгийн ихдээ ${maxCount.toLocaleString("mn-MN")} бүлэг нэмж болно.`
          }
        />
        {submitError ? (
          <p role="alert" className="mt-4 text-sm font-medium text-[var(--danger)]">
            {submitError}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}

export function CreateGroupsDialog(props: CreateGroupsDialogProps) {
  if (!props.open) return null;
  return <CreateGroupsForm {...props} />;
}
