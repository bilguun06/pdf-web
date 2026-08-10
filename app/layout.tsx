import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["cyrillic", "latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PDF Group Manager",
  description: "Олон PDF файлыг тусдаа бүлгээр удирдах local-first ажлын орчин",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="mn">
      <body className={manrope.variable}>{children}</body>
    </html>
  );
}
