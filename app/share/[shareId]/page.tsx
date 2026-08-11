import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SharedProjectViewer } from "@/components/SharedProjectViewer";

const SHARE_ID_PATTERN = /^p_[A-Za-z0-9_-]{22}$/;

export const metadata: Metadata = {
  title: "Хуваалцсан PDF төсөл | PDF Group Manager",
  description: "Зөвхөн үзэх горимоор хуваалцсан PDF төсөл",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function SharedProjectPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  if (!SHARE_ID_PATTERN.test(shareId)) notFound();

  return <SharedProjectViewer shareId={shareId} />;
}
