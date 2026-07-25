import {
  Braces,
  CircleCheckBig,
  FilePlus2,
  FolderOpen,
  GitBranch,
  Play,
} from "lucide-react";

export function WelcomeView({
  projectName,
  notice,
  busy,
  onNew,
  onOpen,
  onReturn,
}: {
  projectName?: string;
  notice: string;
  busy: boolean;
  onNew: () => void;
  onOpen: () => void;
  onReturn?: () => void;
}) {
  return (
    <section className="welcome-view">
      <div className="welcome-glow welcome-glow--left" />
      <div className="welcome-glow welcome-glow--right" />
      <div className="welcome-content">
        <header className="welcome-header">
          <div className="welcome-mark" aria-hidden="true">
            <GitBranch size={30} strokeWidth={2.4} />
          </div>
          <div>
            <strong>司命</strong>
            <span>SIMING</span>
          </div>
        </header>

        <div className="welcome-copy">
          <span className="welcome-kicker">剧情对话编辑器</span>
          <h1>让每一条剧情分支清晰可见</h1>
          <p>
            在本地完成对话编排、数据校验与模拟运行，并交付与 Unity、UE
            等宿主无关的运行时数据。
          </p>
        </div>

        <div className="welcome-actions">
          <button className="welcome-primary" disabled={busy} onClick={onNew}>
            <FilePlus2 size={17} />
            {busy ? "处理中…" : "新建项目"}
          </button>
          <button
            className="welcome-secondary"
            disabled={busy}
            onClick={onOpen}
          >
            <FolderOpen size={17} />
            打开项目
          </button>
          {onReturn && (
            <button className="welcome-return" onClick={onReturn}>
              返回“{projectName}”<span>→</span>
            </button>
          )}
        </div>

        <div className="welcome-features">
          <article>
            <GitBranch size={17} />
            <strong>可视化编排</strong>
            <p>用画布组织节点与分支，也可切换表格和源数据视图。</p>
          </article>
          <article>
            <CircleCheckBig size={17} />
            <strong>校验与模拟</strong>
            <p>在接入游戏前定位内容问题，复现不同变量下的运行路径。</p>
          </article>
          <article>
            <Braces size={17} />
            <strong>引擎无关交付</strong>
            <p>项目文件适合版本控制，运行时数据可由不同宿主消费。</p>
          </article>
        </div>

        <footer className="welcome-footer">
          <Play size={12} />
          <span>{notice}</span>
        </footer>
      </div>
    </section>
  );
}
