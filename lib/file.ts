export const MAX_PDF_SIZE_BYTES = 1_500 * 1024 * 1024;
export const MAX_PROJECT_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const PDF_MIME_TYPES = new Set(["application/pdf", "application/x-pdf"]);
const GENERIC_BINARY_MIME_TYPE = "application/octet-stream";

function normalizedMimeType(file: File): string {
  return file.type.split(";", 1)[0]?.trim().toLocaleLowerCase() ?? "";
}

export function validatePdfFile(file: File): string | null {
  const extensionLooksValid = file.name.toLocaleLowerCase("mn-MN").endsWith(".pdf");
  const mimeType = normalizedMimeType(file);
  const mimeLooksValid = PDF_MIME_TYPES.has(mimeType);

  if (!extensionLooksValid && !mimeLooksValid) {
    return "Энэ файл PDF биш байна.";
  }

  // Some operating systems omit the MIME type or report a generic binary
  // type. A concrete non-PDF MIME type, however, should not be trusted merely
  // because the file was renamed with a .pdf suffix. PDF.js performs the final
  // content validation after this inexpensive check.
  if (
    mimeType &&
    mimeType !== GENERIC_BINARY_MIME_TYPE &&
    !mimeLooksValid
  ) {
    return "Файлын төрөл PDF биш байна.";
  }

  if (file.size === 0) {
    return "PDF файл хоосон байна.";
  }

  if (file.size > MAX_PDF_SIZE_BYTES) {
    return `PDF файл хэт том байна. ${formatFileSize(MAX_PDF_SIZE_BYTES)}-аас бага файл сонгоно уу.`;
  }

  return null;
}

export function validateProjectFile(file: File): string | null {
  const lowerName = file.name.toLocaleLowerCase("mn-MN");
  const mimeType = normalizedMimeType(file);
  const extensionLooksValid = lowerName.endsWith(".json");
  const mimeLooksValid =
    mimeType === "application/json" ||
    mimeType === "text/json" ||
    mimeType === GENERIC_BINARY_MIME_TYPE;

  if (!extensionLooksValid && !mimeLooksValid) {
    return "Зөвхөн төслийн JSON файл сонгоно уу.";
  }
  if (file.size === 0) {
    return "Төслийн файл хоосон байна.";
  }
  if (file.size > MAX_PROJECT_FILE_SIZE_BYTES) {
    return `Төслийн файл хэт том байна. ${formatFileSize(MAX_PROJECT_FILE_SIZE_BYTES)}-аас бага файл сонгоно уу.`;
  }
  return null;
}

export function formatFileSize(bytes?: number) {
  if (!bytes || bytes < 1) return "";
  const units = ["Б", "КБ", "МБ", "ГБ"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  const digits = value >= 10 || index === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[index]}`;
}
