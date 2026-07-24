import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

const FALLBACK_VERSION = "web preview";

export default function App() {
  const [coreVersion, setCoreVersion] = useState("正在连接共享核心…");
  const [connectionState, setConnectionState] = useState<
    "connecting" | "connected" | "browser"
  >("connecting");

  useEffect(() => {
    let active = true;

    invoke<string>("core_version")
      .then((version) => {
        if (active) {
          setCoreVersion(version);
          setConnectionState("connected");
        }
      })
      .catch(() => {
        if (active) {
          setCoreVersion(FALLBACK_VERSION);
          setConnectionState("browser");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="app-shell">
      <section className="baseline-card" aria-labelledby="product-name">
        <div className="brand-mark" aria-hidden="true">
          司
        </div>
        <p className="eyebrow">SIMING ENGINEERING BASELINE</p>
        <h1 id="product-name">司命（Siming）</h1>
        <p className="description">
          剧情对话编辑器工程基线已经就绪。下一阶段将在此接入项目、画布和数据编辑能力。
        </p>
        <dl className="status-grid">
          <div>
            <dt>React</dt>
            <dd>19</dd>
          </div>
          <div>
            <dt>Tauri</dt>
            <dd>2</dd>
          </div>
          <div>
            <dt>共享核心</dt>
            <dd data-testid="core-version">{coreVersion}</dd>
          </div>
        </dl>
        <p className={`connection-state connection-state--${connectionState}`}>
          {connectionState === "connected"
            ? "IPC 已连接"
            : connectionState === "browser"
              ? "浏览器预览模式"
              : "连接中"}
        </p>
      </section>
    </main>
  );
}
