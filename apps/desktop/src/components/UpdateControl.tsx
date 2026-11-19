import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
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

function useUpdateSession() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [downloaded, setDownloaded] = useState(0);
  const [total, setTotal] = useState<number>();
  const update = useRef<Update | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  const busy =
    phase === "checking" || phase === "downloading" || phase === "installing";
  const canCheck = !busy && phase !== "ready" && phase !== "installed";

  function releaseUpdate() {
    const previous = update.current;
    update.current = null;
    return previous?.close().catch(() => {});
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (!locked.current) void releaseUpdate();
    };
  }, []);

  async function checkUpdate() {
    if (locked.current || !canCheck) return;
    locked.current = true;
    setPhase("checking");
    setMessage("");
    try {
      await releaseUpdate();
      if (!mounted.current) return;
      const result = await check({ timeout: 20000 });
      if (!mounted.current) {
        await result?.close().catch(() => {});
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
    if (locked.current || phase !== "available" || !update.current) return;
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
      if (!mounted.current) await releaseUpdate();
    }
  }

  async function install() {
    if (locked.current || phase !== "ready" || !update.current) return;
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
      if (!mounted.current) await releaseUpdate();
    }
  }

  return {
    release: update.current,
    phase,
    message,
    downloaded,
    total,
    canCheck,
    checkUpdate,
    download,
    install,
  };
}

const UpdateContext = createContext<ReturnType<typeof useUpdateSession> | null>(
  null,
);

export function UpdateProvider({ children }: { children: ReactNode }) {
  const session = useUpdateSession();
  return (
    <UpdateContext.Provider value={session}>{children}</UpdateContext.Provider>
  );
}

export function UpdateControl() {
  const session = useContext(UpdateContext);
  const [version, setVersion] = useState("");
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (isTauri())
      void getVersion()
        .then(setVersion)
        .catch(() => {});
  }, []);

  if (!session) throw new Error("UpdateControl requires an UpdateProvider");
  const { release, phase, message, downloaded, total, canCheck } = session;
  const canView =
    phase === "available" || phase === "downloading" || phase === "ready";
  const canClose = phase !== "installing";

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
            disabled={!isTauri() || !canCheck}
            onClick={() => void session.checkUpdate()}
          >
            <RefreshCw size={15} aria-hidden="true" />
            {phase === "checking" ? "正在检查…" : "检查更新"}
          </button>
          {canView && (
            <button
              className="button button--ghost"
              onClick={() => setShowDetails(true)}
            >
              查看更新
            </button>
          )}
          {!showDetails && (phase === "downloading" || message) && (
            <span role="status">
              {phase === "downloading" ? "正在下载更新…" : message}
            </span>
          )}
          {!isTauri() && <span>请在桌面应用中检查更新。</span>}
        </dd>
      </div>
      {showDetails && (
        <Modal
          title={`更新司命至 v${release?.version ?? ""}`}
          onClose={() => {
            if (canClose) setShowDetails(false);
          }}
        >
          <p>更新来源：GitHub 最新正式 Release。安装时应用将退出并重启。</p>
          <pre className="update-notes">
            {release?.body || "此版本未提供更新说明。"}
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
            <button disabled={!canClose} onClick={() => setShowDetails(false)}>
              关闭
            </button>
            {phase === "available" && (
              <button onClick={() => void session.download()}>下载更新</button>
            )}
            {phase === "ready" && (
              <button onClick={() => void session.install()}>安装并重启</button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
