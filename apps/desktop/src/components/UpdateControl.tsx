import { useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { isTauri } from "../lib/projectApi";
import { hasInvalidHostDraft } from "../lib/hostDraftGuard";
import { useEditorStore } from "../store/editorStore";
import { RefreshCw } from "lucide-react";
import { Modal } from "./Modal";

type Phase =
  | "idle"
  | "checking"
  | "available"
  | "latest"
  | "downloading"
  | "ready"
  | "installing"
  | "installed"
  | "error";

export function UpdateControl() {
  const [version, setVersion] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [downloaded, setDownloaded] = useState(0);
  const [total, setTotal] = useState<number>();
  const update = useRef<Update | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  const busy =
    phase === "checking" || phase === "downloading" || phase === "installing";

  useEffect(() => {
    mounted.current = true;
    if (isTauri())
      void getVersion()
        .then(setVersion)
        .catch(() => {});
    return () => {
      mounted.current = false;
      if (!locked.current) void update.current?.close().catch(() => {});
    };
  }, []);

  async function checkUpdate() {
    if (locked.current) return;
    locked.current = true;
    setPhase("checking");
    setMessage("");
    try {
      await update.current?.close();
      update.current = null;
      const result = await check({ timeout: 20000 });
      if (!mounted.current) {
        await result?.close();
        return;
      }
      update.current = result;
      setPhase(result ? "available" : "latest");
      setMessage(
        result ? `发现新版本 v${result.version}` : "当前已是最新版本。",
      );
    } catch (error) {
      setPhase("error");
      setMessage(`检查失败：${String(error)}。请检查网络或稍后重试。`);
    } finally {
      locked.current = false;
    }
  }

  async function download() {
    if (locked.current || !update.current) return;
    locked.current = true;
    setPhase("downloading");
    setMessage("");
    setDownloaded(0);
    setTotal(undefined);
    try {
      await update.current.download(
        (event) => {
          if (event.event === "Started") setTotal(event.data.contentLength);
          if (event.event === "Progress")
            setDownloaded((value) => value + event.data.chunkLength);
        },
        { timeout: 120000 },
      );
      setPhase("ready");
      setMessage("下载及签名校验完成。保存项目后即可安装并重启。");
    } catch (error) {
      setPhase("available");
      setMessage(`下载或签名校验失败：${String(error)}。可重试下载。`);
    } finally {
      locked.current = false;
      if (!mounted.current) {
        await update.current?.close().catch(() => {});
        update.current = null;
      }
    }
  }

  async function install() {
    if (locked.current || !update.current) return;
    const state = useEditorStore.getState();
    if (state.dirty || state.sourceDraftDirty || hasInvalidHostDraft()) {
      setMessage(
        "存在未保存的项目或编辑内容。请关闭此窗口并保存，再安装更新。",
      );
      return;
    }
    locked.current = true;
    setPhase("installing");
    setMessage("正在安装，请勿关闭应用…");
    try {
      await update.current.install();
      setPhase("installed");
      setMessage("更新已安装，正在重启。若未自动重启，请手动退出后重新打开。");
      await relaunch();
    } catch (error) {
      setMessage(
        `安装或重启失败：${String(error)}。请重新启动应用确认版本，或稍后重试。`,
      );
      setPhase((current) => (current === "installed" ? "installed" : "ready"));
    } finally {
      locked.current = false;
    }
  }

  return (
    <>
      <div className="about-detail-row">
        <dt>应用版本</dt>
        <dd className="update-control">
          <span className="update-version">
            {version ? `v${version}` : "—"}
          </span>
          <button
            className="button button--ghost"
            disabled={!isTauri() || busy || phase === "installed"}
            onClick={() => void checkUpdate()}
          >
            <RefreshCw size={15} aria-hidden="true" />
            {phase === "checking" ? "正在检查…" : "检查更新"}
          </button>
          {(phase === "available" || phase === "ready") && (
            <button
              className="button button--ghost"
              onClick={() => setShowDetails(true)}
            >
              查看更新
            </button>
          )}
          {!showDetails && message && <span role="status">{message}</span>}
          {!isTauri() && <span>请在桌面应用中检查更新。</span>}
        </dd>
      </div>
      {showDetails && (
        <Modal
          title={`更新司命至 v${update.current?.version ?? ""}`}
          onClose={() => {
            if (!busy) setShowDetails(false);
          }}
        >
          <p>更新来源：GitHub 最新正式 Release。安装时应用将退出并重启。</p>
          <pre className="update-notes">
            {update.current?.body || "此版本未提供更新说明。"}
          </pre>
          {phase === "downloading" && (
            <div role="status">
              <progress
                max={total || undefined}
                value={total ? downloaded : undefined}
              />
              <p>
                已下载 {(downloaded / 1024 / 1024).toFixed(1)} MB
                {total ? ` / ${(total / 1024 / 1024).toFixed(1)} MB` : ""}
              </p>
            </div>
          )}
          {message && <p role="status">{message}</p>}
          <div className="update-actions">
            <button disabled={busy} onClick={() => setShowDetails(false)}>
              关闭
            </button>
            {phase === "available" && (
              <button onClick={() => void download()}>下载更新</button>
            )}
            {phase === "ready" && (
              <button onClick={() => void install()}>安装并重启</button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
