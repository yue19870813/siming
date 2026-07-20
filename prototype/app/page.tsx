import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Siming 对话编辑器 · 交互稿",
  description: "支持节点编辑、多语言、模拟运行、校验与命令行工作流的 Siming 产品交互原型。",
};

export default function Home() {
  return (
    <main className="prototype-shell">
      <iframe
        className="prototype-frame"
        src="/siming-ui-prototype.html"
        title="Siming 对话编辑器交互稿"
      />
    </main>
  );
}
