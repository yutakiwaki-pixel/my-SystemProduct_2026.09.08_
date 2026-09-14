import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteNav } from "@/components/site-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "カフェ・ソライロ",
  description: "個人経営カフェの店舗サイト（社内ペネトレーションテスト用ラボ / localhost限定）",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-white text-neutral-900">
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
