import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Siming 对话编辑器 · 交互稿",
  description: "Siming 剧情对话编辑器 HTML 交互原型。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
