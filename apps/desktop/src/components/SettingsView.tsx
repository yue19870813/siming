import { FolderCog, MonitorCog, RotateCcw } from "lucide-react";
import type { UserSettings } from "../model/types";
import { useEditorStore } from "../store/editorStore";

export function SettingsView({
  settings,
  onSettingsChange,
}: {
  settings: UserSettings;
  onSettingsChange: (settings: UserSettings) => void;
}) {
  const project = useEditorStore((state) => state.project);
  const commit = useEditorStore((state) => state.commit);

  return (
    <section className="settings-view">
      <header className="workspace-heading">
        <div>
          <small>设置中心</small>
          <h2>项目与用户设置</h2>
          <p>共享配置进入项目，本机偏好只保存在当前设备。</p>
        </div>
      </header>
      <div className="settings-columns">
        <section className="settings-card">
          <header>
            <FolderCog size={18} />
            <div>
              <strong>项目设置</strong>
              <small>写入 .siming/project.json · 可版本控制</small>
            </div>
          </header>
          <div className="form-grid">
            <label className="form-span">
              <span>项目名称</span>
              <input
                value={project.manifest.name}
                onChange={(event) =>
                  commit("修改项目名称", (draft) => {
                    draft.manifest.name = event.target.value;
                  })
                }
              />
            </label>
            <label>
              <span>对话目录</span>
              <input
                value={project.manifest.paths.dialogues}
                onChange={(event) =>
                  commit("修改对话目录", (draft) => {
                    draft.manifest.paths.dialogues = event.target.value;
                  })
                }
              />
              <small>相对于项目根目录</small>
            </label>
            <label>
              <span>导出目录</span>
              <input
                value={project.manifest.paths.exports}
                onChange={(event) =>
                  commit("修改导出目录", (draft) => {
                    draft.manifest.paths.exports = event.target.value;
                  })
                }
              />
              <small>相对于项目根目录</small>
            </label>
            <label>
              <span>默认语言</span>
              <select
                value={project.manifest.defaultLocale}
                onChange={(event) =>
                  commit("修改默认语言", (draft) => {
                    draft.manifest.defaultLocale = event.target.value;
                  })
                }
              >
                {project.manifest.locales.map((locale) => (
                  <option key={locale}>{locale}</option>
                ))}
              </select>
            </label>
            <label>
              <span>支持语言</span>
              <input
                value={project.manifest.locales.join(", ")}
                onChange={(event) =>
                  commit("修改支持语言", (draft) => {
                    const locales = event.target.value
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean);
                    draft.manifest.locales = [...new Set(locales)];
                  })
                }
              />
            </label>
            <div className="resolved-path form-span">
              <span>项目根目录</span>
              <code>{project.rootPath || "演示项目尚未选择磁盘目录"}</code>
            </div>
          </div>
        </section>
        <section className="settings-card">
          <header>
            <MonitorCog size={18} />
            <div>
              <strong>用户设置</strong>
              <small>仅保存在本机 · 不影响导出</small>
            </div>
          </header>
          <div className="form-grid">
            <label className="form-span">
              <span>主题</span>
              <div className="segmented">
                {(["dark", "light"] as const).map((theme) => (
                  <button
                    key={theme}
                    className={
                      settings.theme === theme ? "is-active" : undefined
                    }
                    onClick={() => onSettingsChange({ ...settings, theme })}
                  >
                    {theme === "dark" ? "Dark" : "Light"}
                  </button>
                ))}
              </div>
            </label>
            <label>
              <span>数据编辑器字号</span>
              <input
                type="number"
                min={11}
                max={24}
                value={settings.editorFontSize}
                onChange={(event) =>
                  onSettingsChange({
                    ...settings,
                    editorFontSize: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              <span>恢复快照间隔</span>
              <select
                value={settings.recoverySnapshotIntervalSeconds}
                onChange={(event) =>
                  onSettingsChange({
                    ...settings,
                    recoverySnapshotIntervalSeconds: Number(event.target.value),
                  })
                }
              >
                <option value={30}>30 秒</option>
                <option value={60}>60 秒</option>
                <option value={120}>2 分钟</option>
              </select>
            </label>
            <label className="checkbox-field form-span">
              <input
                type="checkbox"
                checked={settings.restoreLastProject}
                onChange={(event) =>
                  onSettingsChange({
                    ...settings,
                    restoreLastProject: event.target.checked,
                  })
                }
              />
              启动时恢复上次项目
            </label>
            <button
              className="button button--ghost form-span"
              onClick={() =>
                onSettingsChange({
                  schemaVersion: 1,
                  theme: "dark",
                  defaultProjectDirectory: null,
                  editorFontSize: 13,
                  recoverySnapshotIntervalSeconds: 60,
                  restoreLastProject: true,
                })
              }
            >
              <RotateCcw size={14} /> 恢复用户默认设置
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}
