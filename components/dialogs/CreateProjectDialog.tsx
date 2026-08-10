"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";

export interface CreateProjectValues {
  name: string;
  groupCount: number;
}

export interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (values: CreateProjectValues) => void | Promise<void>;
  initialName?: string;
  initialGroupCount?: number;
  loading?: boolean;
}

type CreateProjectFormProps = Omit<CreateProjectDialogProps, "open">;

function CreateProjectForm({
  onOpenChange,
  onCreate,
  initialName = "Шинэ төсөл",
  initialGroupCount = 21,
  loading = false,
}: CreateProjectFormProps) {
  const formId = useId();
  const [name, setName] = useState(initialName);
  const [count, setCount] = useState(String(initialGroupCount));
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState<string>();
  const [countError, setCountError] = useState<string>();
  const [submitError, setSubmitError] = useState<string>();
  const busy = loading || submitting;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanName = name.trim();
    const parsedCount = Number(count);
    const validCount = Number.isSafeInteger(parsedCount) && parsedCount >= 1;
    setNameError(cleanName ? undefined : "Төслийн нэр оруулна уу.");
    setCountError(validCount ? undefined : "1 буюу түүнээс их бүхэл тоо оруулна уу.");
    setSubmitError(undefined);
    if (!cleanName || !validCount) return;

    setSubmitting(true);
    try {
      await onCreate({ name: cleanName, groupCount: parsedCount });
      onOpenChange(false);
    } catch (reason) {
      setSubmitError(
        reason instanceof Error && reason.message
          ? reason.message
          : "Шинэ төсөл үүсгэж чадсангүй.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title="Шинэ төсөл үүсгэх"
      description="Шинэ төсөл одоогийн local төслийг солино. Одоогийн PDF-үүд хэрэгтэй бол эх файлуудаа хадгалсан эсэхээ шалгаад үргэлжлүүлнэ үү."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Болих
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={busy}>
            Төсөл үүсгэх
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-5">
        <FormField
          autoFocus
          name="projectName"
          label="Төслийн нэр"
          value={name}
          maxLength={100}
          disabled={busy}
          onChange={(event) => {
            setName(event.target.value);
            if (nameError) setNameError(undefined);
          }}
          error={nameError}
          placeholder="Жишээ: 2026 Архив"
        />
        <FormField
          name="groupCount"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          label="Эхлэх бүлгийн тоо"
          value={count}
          disabled={busy}
          onChange={(event) => {
            setCount(event.target.value);
            if (countError) setCountError(undefined);
          }}
          error={countError}
          hint="21 бүлэг сонговол TSCMP-ORP нэрүүдээр, бусад тохиолдолд “Бүлэг 1”, “Бүлэг 2” гэж үүснэ."
        />
        {submitError ? (
          <p role="alert" className="text-sm font-medium text-[var(--danger)]">
            {submitError}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}

export function CreateProjectDialog(props: CreateProjectDialogProps) {
  if (!props.open) return null;
  return <CreateProjectForm {...props} />;
}
