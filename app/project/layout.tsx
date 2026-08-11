import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cloud Editor · PDF Group Manager",
  description: "PDF Group Manager cloud төслийн editor",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function ProjectLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
