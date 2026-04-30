import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "x402-kit Dashboard",
  description: "Live revenue and usage metrics for an x402-kit server.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
