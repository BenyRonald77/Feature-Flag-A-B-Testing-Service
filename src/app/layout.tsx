import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Feature Flag & A/B Testing",
  description: "Toggle fitur tanpa redeploy, gradual rollout, assignment variant konsisten, dan grafik konversi per variant.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
