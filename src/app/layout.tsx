import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Data Analyst",
  description: "Upload a CSV and get an instant AI-generated report",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
