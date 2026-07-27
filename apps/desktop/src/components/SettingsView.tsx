import { FolderCog, MonitorCog, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { chooseProjectDirectory } from "../lib/projectApi";
import { DEFAULT_PROJECT_LOCALES, localeName } from "../model/locales";
import type { SystemSettings } from "../model/types";
import { useEditorStore } from "../store/editorStore";

type SettingsScope = "project" | "system";

const systemDefaults: SystemSettings = {
  schemaVersion: 1,
  theme: "dark",
  defaultProjectDirectory: null,
  interfaceLocale: "zh-CN",
  uiFontSize: "medium",
  editorFontSize: 13,
  keymap: "system",
  autoSaveDelaySeconds: 30,
  recoverySnapshotIntervalSeconds: 60,
  restoreLastProject: true,
  projectExportDirectories: {},
};

export function SettingsView({
  settings,
  onSettingsChange,
}: {
  settings: SystemSettings;
  onSettingsChange: (settings: SystemSettings, showNotice?: boolean) => void;
}) {
  const project = useEditorStore((state) => state.project);
  const commit = useEditorStore((state) => state.commit);
  const setNotice = useEditorStore((state) => state.setNotice);
  const [scope, setScope] = useState<SettingsScope>("project");
  const [projectDraft, setProjectDraft] = useState(() => ({
    name: project.manifest.name,
    dialogues: project.manifest.paths.dialogues,
    exports:
      settings.projectExportDirectories[project.manifest.projectId] ?? "",
    exportPathMode: isAbsolutePath(
      settings.projectExportDirectories[project.manifest.projectId] ?? "",
    )
      ? ("absolute" as const)
      : ("relative" as const),
    defaultLocale: project.manifest.defaultLocale,
    locales: project.manifest.locales.join(", "),
  }));
  const [systemDraft, setSystemDraft] = useState(settings);

  useEffect(() => {
    setProjectDraft({
      name: project.manifest.name,
      dialogues: project.manifest.paths.dialogues,
      exports:
        settings.projectExportDirectories[project.manifest.projectId] ?? "",
      exportPathMode: isAbsolutePath(
        settings.projectExportDirectories[project.manifest.projectId] ?? "",
      )
        ? "absolute"
        : "relative",
      defaultLocale: project.manifest.defaultLocale,
      locales: project.manifest.locales.join(", "),
    });
  }, [
    project.manifest.defaultLocale,
    project.manifest.locales,
    project.manifest.name,
    project.manifest.paths.dialogues,
    project.manifest.paths.exports,
    project.manifest.projectId,
    settings.projectExportDirectories,
  ]);

  useEffect(() => {
    setSystemDraft(settings);
  }, [settings]);

  useEffect(
    () => () => {
      document.documentElement.dataset.theme = settings.theme;
    },
    [settings.theme],
  );

  const applyProjectSettings = () => {
    const locales = [
      ...new Set(
        projectDraft.locales
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ];
    if (!locales.includes(projectDraft.defaultLocale)) {
      setNotice("默认语言必须包含在支持语言列表中。");
      return;
    }
    if (!isRelativeProjectPath(projectDraft.dialogues)) {
      setNotice("对话目录必须是项目内的相对路径。");
      return;
    }
    if (
      projectDraft.exportPathMode === "relative" &&
      projectDraft.exports.trim() &&
      !isRelativeProjectPath(projectDraft.exports)
    ) {
      setNotice("相对导出目录必须是项目内且不能包含 ..。");
      return;
    }
    if (
      projectDraft.exportPathMode === "absolute" &&
      projectDraft.exports.trim() &&
      !isAbsolutePath(projectDraft.exports)
    ) {
      setNotice("绝对导出目录必须是完整的本机路径。");
      return;
    }
    commit("应用项目设置", (draft) => {
      draft.manifest.name = projectDraft.name.trim() || "未命名项目";
      draft.manifest.paths.dialogues = normalizeDirectory(
        projectDraft.dialogues,
      );
      if (
        projectDraft.exportPathMode === "relative" &&
        projectDraft.exports.trim()
      ) {
        draft.manifest.paths.exports = normalizeDirectory(projectDraft.exports);
      }
      draft.manifest.defaultLocale = projectDraft.defaultLocale;
      draft.manifest.locales = locales;
    });
    const projectExportDirectories = {
      ...settings.projectExportDirectories,
    };
    if (projectDraft.exports.trim()) {
      projectExportDirectories[project.manifest.projectId] =
        projectDraft.exportPathMode === "absolute"
          ? normalizeAbsoluteDirectory(projectDraft.exports)
          : normalizeDirectory(projectDraft.exports);
    } else {
      delete projectExportDirectories[project.manifest.projectId];
    }
    onSettingsChange({ ...settings, projectExportDirectories }, false);
    setNotice(
      projectDraft.exportPathMode === "absolute"
        ? "项目设置已应用；绝对导出目录仅保存在本机。"
        : "项目设置已应用，保存项目后写入 .siming/project.json。",
    );
  };

  return (
    <section className="settings-view settings-hub">
      <header className="settings-header">
        <strong>设置</strong>
        <span>
          {scope === "project"
            ? "项目设置保存到项目配置，可随版本控制共享"
            : "系统设置仅保存在本机，不影响项目成员"}
        </span>
      </header>
      <div className="settings-body">
        <aside className="settings-scope-nav">
          <small>设置范围</small>
          <button
            className={scope === "project" ? "is-active" : undefined}
            onClick={() => setScope("project")}
          >
            <FolderCog size={14} /> 项目设置
          </button>
          <button
            className={scope === "system" ? "is-active" : undefined}
            onClick={() => setScope("system")}
          >
            <MonitorCog size={14} /> 系统设置
          </button>
        </aside>
        <main className="settings-page">
          {scope === "project" ? (
            <>
              <SettingsPageHeading
                title="项目设置"
                description="这些配置属于当前项目。相对路径会随项目一起共享，适合版本控制和多人协作。"
              />
              <SettingsGroup title="项目文件">
                <SettingsRow
                  title="项目根目录"
                  help="本机上打开项目的位置，不写入项目配置。"
                >
                  <div className="settings-control-with-button">
                    <input
                      value={project.rootPath || "尚未选择项目目录"}
                      readOnly
                    />
                    <button
                      className="button button--ghost"
                      onClick={() =>
                        setNotice("请通过左上角项目菜单打开其他项目目录。")
                      }
                    >
                      选择…
                    </button>
                  </div>
                </SettingsRow>
                <SettingsRow
                  title="项目配置文件"
                  help="保存可共享的项目级设置。"
                >
                  <input value=".siming/project.json" readOnly />
                </SettingsRow>
                <SettingsRow
                  title="项目名称"
                  help="显示在窗口标题和项目菜单中。"
                >
                  <input
                    value={projectDraft.name}
                    onChange={(event) =>
                      setProjectDraft({
                        ...projectDraft,
                        name: event.target.value,
                      })
                    }
                  />
                </SettingsRow>
                <SettingsRow
                  title="对话文件目录"
                  help="相对于项目根目录，移动项目后仍然有效。"
                >
                  <input
                    value={projectDraft.dialogues}
                    onChange={(event) =>
                      setProjectDraft({
                        ...projectDraft,
                        dialogues: event.target.value,
                      })
                    }
                  />
                  <small className="path-resolution">
                    解析为：
                    {resolvePath(project.rootPath, projectDraft.dialogues)}
                  </small>
                </SettingsRow>
              </SettingsGroup>
              <SettingsGroup title="导出">
                <SettingsRow
                  title="路径类型"
                  help="团队项目推荐使用相对于项目根目录的路径。"
                >
                  <div className="segmented settings-segmented">
                    <button
                      aria-label="相对路径"
                      aria-pressed={projectDraft.exportPathMode === "relative"}
                      className={
                        projectDraft.exportPathMode === "relative"
                          ? "is-active"
                          : undefined
                      }
                      onClick={() =>
                        setProjectDraft({
                          ...projectDraft,
                          exportPathMode: "relative",
                          exports: isAbsolutePath(projectDraft.exports)
                            ? ""
                            : projectDraft.exports,
                        })
                      }
                    >
                      相对路径
                    </button>
                    <button
                      aria-label="绝对路径"
                      aria-pressed={projectDraft.exportPathMode === "absolute"}
                      className={
                        projectDraft.exportPathMode === "absolute"
                          ? "is-active"
                          : undefined
                      }
                      onClick={() =>
                        setProjectDraft({
                          ...projectDraft,
                          exportPathMode: "absolute",
                          exports: isAbsolutePath(projectDraft.exports)
                            ? projectDraft.exports
                            : "",
                        })
                      }
                    >
                      绝对路径
                    </button>
                  </div>
                </SettingsRow>
                <SettingsRow
                  title="导出文件位置"
                  help={
                    projectDraft.exportPathMode === "relative"
                      ? "桌面端与 CLI 默认输出到同一目录。"
                      : "绝对路径仅用于当前设备的桌面端导出。"
                  }
                >
                  <div className="settings-control-with-button">
                    <input
                      value={projectDraft.exports}
                      onChange={(event) =>
                        setProjectDraft({
                          ...projectDraft,
                          exports: event.target.value,
                        })
                      }
                    />
                    {projectDraft.exportPathMode === "absolute" && (
                      <button
                        className="button button--ghost"
                        onClick={async () => {
                          try {
                            const path =
                              await chooseProjectDirectory("选择导出目录");
                            if (path) {
                              setProjectDraft({
                                ...projectDraft,
                                exports: path,
                              });
                            }
                          } catch (error) {
                            setNotice(
                              error instanceof Error
                                ? error.message
                                : "无法选择导出目录",
                            );
                          }
                        }}
                      >
                        选择…
                      </button>
                    )}
                  </div>
                  <small className="path-resolution">
                    {!projectDraft.exports.trim()
                      ? "未设置，首次导出时选择目录。"
                      : projectDraft.exportPathMode === "relative"
                        ? `解析为：${resolvePath(
                            project.rootPath,
                            projectDraft.exports,
                          )}`
                        : "绝对路径仅保存在当前设备，不会写入项目配置。"}
                  </small>
                </SettingsRow>
                <SettingsRow
                  title="默认导出格式"
                  help="工具栏主按钮将优先使用该格式。"
                >
                  <select value="json" disabled>
                    <option value="json">运行时 JSON</option>
                  </select>
                </SettingsRow>
                <SettingsRow
                  title="多语言目录结构"
                  help="结构与文本资源分离，方便翻译文件独立维护。"
                >
                  <select value="by-locale" disabled>
                    <option value="by-locale">按语言拆分目录</option>
                  </select>
                </SettingsRow>
              </SettingsGroup>
              <SettingsGroup title="语言">
                <SettingsRow title="默认语言" help="缺失翻译时回退到此语言。">
                  <select
                    value={projectDraft.defaultLocale}
                    onChange={(event) =>
                      setProjectDraft({
                        ...projectDraft,
                        defaultLocale: event.target.value,
                      })
                    }
                  >
                    {project.manifest.locales.map((locale) => (
                      <option key={locale} value={locale}>
                        {localeName(locale)}（{locale}）
                      </option>
                    ))}
                  </select>
                </SettingsRow>
                <SettingsRow
                  title="支持语言"
                  help="语言代码使用 BCP 47，以逗号分隔。"
                >
                  <input
                    value={projectDraft.locales}
                    onChange={(event) =>
                      setProjectDraft({
                        ...projectDraft,
                        locales: event.target.value,
                      })
                    }
                  />
                </SettingsRow>
              </SettingsGroup>
              <SettingsActions
                note="写入 .siming/project.json，可随版本控制共享"
                onReset={() =>
                  setProjectDraft({
                    name: project.manifest.name,
                    dialogues: "dialogues/",
                    exports: "",
                    exportPathMode: "relative",
                    defaultLocale: "zh-CN",
                    locales: DEFAULT_PROJECT_LOCALES.join(", "),
                  })
                }
                onSave={applyProjectSettings}
                saveLabel="应用项目设置"
              />
            </>
          ) : (
            <>
              <SettingsPageHeading
                title="系统设置"
                description="这些偏好仅保存在当前设备，不会写入项目文件，也不会影响其他协作者。"
              />
              <SettingsGroup title="默认位置">
                <SettingsRow
                  title="新项目保存位置"
                  help="新建项目时默认打开的本机目录。"
                >
                  <div className="settings-control-with-button">
                    <input
                      value={systemDraft.defaultProjectDirectory ?? ""}
                      placeholder="尚未设置"
                      onChange={(event) =>
                        setSystemDraft({
                          ...systemDraft,
                          defaultProjectDirectory: event.target.value || null,
                        })
                      }
                    />
                    <button
                      className="button button--ghost"
                      onClick={async () => {
                        try {
                          const path = await chooseProjectDirectory();
                          if (path) {
                            setSystemDraft({
                              ...systemDraft,
                              defaultProjectDirectory: path,
                            });
                          }
                        } catch (error) {
                          setNotice(
                            error instanceof Error
                              ? error.message
                              : "无法选择目录",
                          );
                        }
                      }}
                    >
                      选择…
                    </button>
                  </div>
                </SettingsRow>
              </SettingsGroup>
              <SettingsGroup title="外观与编辑">
                <SettingsRow title="界面语言" help="只影响编辑器界面。">
                  <select
                    value={systemDraft.interfaceLocale}
                    onChange={(event) =>
                      setSystemDraft({
                        ...systemDraft,
                        interfaceLocale: event.target
                          .value as SystemSettings["interfaceLocale"],
                      })
                    }
                  >
                    <option value="zh-CN">简体中文</option>
                    <option value="en-US">English</option>
                  </select>
                </SettingsRow>
                <SettingsRow
                  title="主题"
                  help="选择后立即预览，保存后作为本机偏好。"
                >
                  <select
                    value={systemDraft.theme}
                    onChange={(event) => {
                      const theme = event.target
                        .value as SystemSettings["theme"];
                      setSystemDraft({ ...systemDraft, theme });
                      document.documentElement.dataset.theme = theme;
                    }}
                  >
                    <option value="dark">深色</option>
                    <option value="light">浅色</option>
                  </select>
                </SettingsRow>
                <SettingsRow
                  title="编辑器字号"
                  help="影响编辑器界面的常规文字大小。"
                >
                  <select
                    value={systemDraft.uiFontSize}
                    onChange={(event) =>
                      setSystemDraft({
                        ...systemDraft,
                        uiFontSize: event.target
                          .value as SystemSettings["uiFontSize"],
                      })
                    }
                  >
                    <option value="small">小</option>
                    <option value="medium">中</option>
                    <option value="large">大</option>
                  </select>
                </SettingsRow>
                <SettingsRow
                  title="数据编辑器字号"
                  help="仅影响 JSON 数据视图。"
                >
                  <select
                    value={systemDraft.editorFontSize}
                    onChange={(event) =>
                      setSystemDraft({
                        ...systemDraft,
                        editorFontSize: Number(event.target.value),
                      })
                    }
                  >
                    {[11, 12, 13, 14, 16, 18].map((size) => (
                      <option key={size} value={size}>
                        {size} px
                      </option>
                    ))}
                  </select>
                </SettingsRow>
                <SettingsRow
                  title="快捷键方案"
                  help="可使用系统默认或常见编辑器键位。"
                >
                  <select
                    value={systemDraft.keymap}
                    onChange={(event) =>
                      setSystemDraft({
                        ...systemDraft,
                        keymap: event.target.value as SystemSettings["keymap"],
                      })
                    }
                  >
                    <option value="system">系统默认</option>
                    <option value="macos">macOS</option>
                    <option value="windows">Windows / Linux</option>
                  </select>
                </SettingsRow>
              </SettingsGroup>
              <SettingsGroup title="本地行为">
                <SettingsRow
                  title="自动保存"
                  help="项目内容无操作一段时间后自动写入。"
                >
                  <select
                    value={systemDraft.autoSaveDelaySeconds}
                    onChange={(event) =>
                      setSystemDraft({
                        ...systemDraft,
                        autoSaveDelaySeconds: Number(event.target.value),
                      })
                    }
                  >
                    <option value={0}>关闭</option>
                    <option value={30}>30 秒后</option>
                    <option value={60}>60 秒后</option>
                    <option value={120}>2 分钟后</option>
                  </select>
                </SettingsRow>
                <SettingsRow
                  title="启动时恢复"
                  help="重新打开上次使用的项目和对话。"
                >
                  <select
                    value={systemDraft.restoreLastProject ? "last" : "picker"}
                    onChange={(event) =>
                      setSystemDraft({
                        ...systemDraft,
                        restoreLastProject: event.target.value === "last",
                      })
                    }
                  >
                    <option value="last">上次项目</option>
                    <option value="picker">项目选择页</option>
                  </select>
                </SettingsRow>
              </SettingsGroup>
              <SettingsActions
                note="保存在本机系统配置中，不提交到版本控制"
                onReset={() => {
                  setSystemDraft(systemDefaults);
                  document.documentElement.dataset.theme = "dark";
                }}
                onSave={() => onSettingsChange(systemDraft)}
                saveLabel="保存系统设置"
              />
            </>
          )}
        </main>
      </div>
    </section>
  );
}

function SettingsPageHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="settings-page-heading">
      <h2>{title}</h2>
      <p>{description}</p>
    </header>
  );
}

function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-group">
      <header>{title}</header>
      {children}
    </section>
  );
}

function SettingsRow({
  title,
  help,
  children,
}: {
  title: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <label className="settings-row">
      <span>
        <strong>{title}</strong>
        <small>{help}</small>
      </span>
      <div>{children}</div>
    </label>
  );
}

function SettingsActions({
  note,
  onReset,
  onSave,
  saveLabel,
}: {
  note: string;
  onReset: () => void;
  onSave: () => void;
  saveLabel: string;
}) {
  return (
    <footer className="settings-actions">
      <span>{note}</span>
      <button className="button button--ghost" onClick={onReset}>
        <RotateCcw size={13} /> 恢复默认
      </button>
      <button className="button button--primary" onClick={onSave}>
        {saveLabel}
      </button>
    </footer>
  );
}

function normalizeDirectory(value: string) {
  const normalized = value
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "");
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

function isRelativeProjectPath(value: string) {
  const normalized = value.trim().replaceAll("\\", "/");
  return (
    !!normalized &&
    !normalized.startsWith("/") &&
    !/^[A-Za-z]:\//.test(normalized) &&
    !normalized.split("/").includes("..")
  );
}

function isAbsolutePath(value: string) {
  const normalized = value.trim().replaceAll("\\", "/");
  return (
    (normalized.startsWith("/") && normalized !== "/") ||
    (normalized.startsWith("//") && normalized.length > 2) ||
    (/^[A-Za-z]:\//.test(normalized) && !/^[A-Za-z]:\/$/.test(normalized))
  );
}

function normalizeAbsoluteDirectory(value: string) {
  return value.trim().replaceAll("\\", "/").replace(/\/+$/, "");
}

function resolvePath(root: string, relative: string) {
  const base = root || "<项目根目录>";
  return `${base.replace(/\/$/, "")}/${normalizeDirectory(relative)}`;
}
