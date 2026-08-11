import "server-only";

export interface CloudPdfDto {
  id: string;
  originalName: string;
  blobUrl: string;
  pageCount: number;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
}

export interface CloudGroupDto {
  id: string;
  clientId: string | null;
  name: string;
  sortOrder: number;
  note: string | null;
  lastViewedPage: number;
  createdAt: string;
  updatedAt: string;
  pdf: CloudPdfDto | null;
}

export interface CloudProjectDto {
  id: string;
  shareId: string;
  name: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  groups: CloudGroupDto[];
}

export type SharedGroupDto = Omit<
  CloudGroupDto,
  "clientId" | "lastViewedPage" | "createdAt"
>;

export interface SharedProjectDto {
  shareId: string;
  name: string;
  updatedAt: string;
  groups: SharedGroupDto[];
}
