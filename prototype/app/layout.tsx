import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "司命（Siming）剧情对话编辑器 · 交互稿",
  description: "支持可视化画布与真实源 JSON 编辑的 Siming 剧情对话编辑器 HTML 交互原型。",
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
