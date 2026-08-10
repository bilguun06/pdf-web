"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";

export interface RenameGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
  onRename: (name: string) => void | Promise<void>;
  loading?: boolean;
}

function RenameGroupForm({
  onOpenChange,
  currentName,
  onRename,
  loading = false,
}: Omit<RenameGroupDialogProps, "open">) {
  const formId = useId();
  const [name, setName] = useState(currentName);
  const [nameError, setNameError] = useState<string>();
  const [submitError, setSubmitError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const busy = loading || submitting;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanName = name.trim();
    setNameError(cleanName ? undefined : "Бүлгийн нэр оруулна уу.");
    setSubmitError(undefined);
    if (!cleanName) return;

    if (cleanName === currentName.trim()) {
      onOpenChange(false);
      return;
    }

    setSubmitting(true);
    try {
      await onRename(cleanName);
      onOpenChange(false);
    } catch (reason) {
      setSubmitError(
        reason instanceof Error && reason.message
          ? reason.message
          : "Бүлгийн нэрийг өөрчилж чадсангүй.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title="Бүлгийн нэр өөрчлөх"
      description="Товч бөгөөд ялгахад хялбар нэр сонгоно уу."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Болих
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={busy}>
            Хадгалах
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit}>
        <FormField
          autoFocus
          name="groupName"
          label="Бүлгийн нэр"
          value={name}
          maxLength={100}
          disabled={busy}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => {
            setName(event.target.value);
            if (nameError) setNameError(undefined);
          }}
          error={nameError}
          placeholder="Жишээ: Гэрээ"
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

export function RenameGroupDialog(props: RenameGroupDialogProps) {
  if (!props.open) return null;
  return <RenameGroupForm {...props} />;
}
