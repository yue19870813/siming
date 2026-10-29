import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Braces,
  CircleCheckBig,
  FilePlus2,
  FolderOpen,
  GitBranch,
  Play,
} from "lucide-react";

const repositoryUrl = "https://github.com/yue19870813/siming";

export function WelcomeView({
  projectName,
  notice,
  busy,
  onNew,
  onOpen,
  newProjectRootPath,
  onCreateNew,
  onCancelNew,
  onReturn,
}: {
  projectName?: string;
  notice: string;
  busy: boolean;
  onNew: () => void;
  onOpen: () => void;
  newProjectRootPath?: string | null;
  onCreateNew?: (name: string) => void;
  onCancelNew?: () => void;
  onReturn?: () => void;
}) {
  const [newProjectName, setNewProjectName] = useState("新的司命项目");

  useEffect(() => {
    if (newProjectRootPath) setNewProjectName("新的司命项目");
  }, [newProjectRootPath]);

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
          {notice === "欢迎使用司命。" ? (
            <a
              href={repositoryUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => {
                event.preventDefault();
                void openUrl(repositoryUrl);
              }}
            >
              {notice}
            </a>
          ) : (
            <span>{notice}</span>
          )}
        </footer>
      </div>
      {newProjectRootPath && onCreateNew && onCancelNew && (
        <div className="welcome-modal-backdrop">
          <form
            className="welcome-modal"
            aria-label="新建项目"
            onSubmit={(event) => {
              event.preventDefault();
              const name = newProjectName.trim();
              if (name) onCreateNew(name);
            }}
          >
            <div>
              <span className="welcome-kicker">新建项目</span>
              <h2>设置项目名称</h2>
              <p>项目文件将创建在所选目录中。</p>
            </div>
            <label>
              项目名称
              <input
                autoFocus
                value={newProjectName}
                disabled={busy}
                onChange={(event) => setNewProjectName(event.target.value)}
              />
            </label>
            <div className="welcome-modal-path">
              <span>项目目录</span>
              <code>{newProjectRootPath}</code>
            </div>
            {notice.startsWith("新建项目失败：") && (
              <p className="welcome-modal-error" role="alert">
                {notice}
              </p>
            )}
            <div className="welcome-modal-actions">
              <button type="button" disabled={busy} onClick={onCancelNew}>
                取消
              </button>
              <button
                className="welcome-primary"
                type="submit"
                disabled={busy || !newProjectName.trim()}
              >
                {busy ? "创建中…" : "创建项目"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
