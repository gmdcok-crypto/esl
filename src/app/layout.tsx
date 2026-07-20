import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ESL Platform",
  description: "SoluM AIMS SaaS 기반 전자명패 연동 플랫폼",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
