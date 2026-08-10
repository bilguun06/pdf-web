"use client";

import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";

export interface ConfirmDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupName: string;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
  hasPdf?: boolean;
}

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  groupName,
  onConfirm,
  loading = false,
  hasPdf = false,
}: ConfirmDeleteDialogProps) {
  const pdfWarning = hasPdf
    ? " Тус бүлгийн PDF файл болон уншсан хуудасны мэдээлэл мөн устах болно."
    : "";

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Бүлгийг устгах уу?"
      description={`“${groupName}” бүлгийг буцаах боломжгүйгээр устгана.${pdfWarning}`}
      confirmLabel="Бүлгийг устгах"
      destructive
      loading={loading}
      onConfirm={onConfirm}
    />
  );
}
