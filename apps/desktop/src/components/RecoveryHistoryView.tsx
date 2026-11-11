import { useEffect, useMemo, useState } from "react";
import { History, LoaderCircle, RotateCcw } from "lucide-react";
import {
  listRecoverySnapshots,
  readRecoverySnapshotAt,
} from "../lib/projectApi";
import { plainText } from "../model/richText";
import type {
  ProjectSnapshot,
  RecoverySnapshot,
  RecoverySnapshotSummary,
} from "../model/types";

export function RecoveryHistoryView({
  project,
  onRestore,
}: {
  project: ProjectSnapshot;
  onRestore: (snapshot: RecoverySnapshot, file: string) => void;
}) {
  const [items, setItems] = useState<RecoverySnapshotSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<RecoverySnapshot | null>(null);
  const [dialogueId, setDialogueId] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoadingList(true);
    setError("");
    void listRecoverySnapshots(project.manifest.projectId)
      .then((result) => {
        if (!active) return;
        setItems(result);
        const firstFile = result.flatMap((item) => item.changedFiles)[0] ?? null;
        setSelectedFile(firstFile);
        setSelectedId(
          result.find((item) => item.changedFiles.includes(firstFile ?? ""))
            ?.snapshotId ?? null,
        );
      })
      .catch((reason: unknown) => {
        if (active) setError(errorText(reason));
      })
      .finally(() => {
        if (active) setLoadingList(false);
      });
    return () => {
      active = false;
    };
  }, [project.manifest.projectId]);

  useEffect(() => {
    if (!selectedId) {
      setSnapshot(null);
      return;
    }
    let active = true;
    setLoadingSnapshot(true);
    setError("");
    void readRecoverySnapshotAt(project.manifest.projectId, selectedId)
      .then((result) => {
        if (!active) return;
        setSnapshot(result);
        setDialogueId(result?.project.dialogues[0]?.id ?? "");
        if (!result) setError("这份快照已不存在或无法读取。");
      })
      .catch((reason: unknown) => {
        if (active) setError(errorText(reason));
      })
      .finally(() => {
        if (active) setLoadingSnapshot(false);
      });
    return () => {
      active = false;
    };
  }, [project.manifest.projectId, selectedId]);

  const files = [...new Set(items.flatMap((item) => item.changedFiles))].sort();
  const fileVersions = items.filter((item) =>
    item.changedFiles.includes(selectedFile ?? ""),
  );
  const selectedSummary = items.find((item) => item.snapshotId === selectedId);
  const dialogue = snapshot?.project.dialogues.find(
    (item) => item.id === dialogueId,
  );
  const nodes = useMemo(() => dialogue?.nodes ?? [], [dialogue]);
  const entry = dialogue
    ? snapshot?.project.manifest.dialogues.find(
        (item) => item.id === dialogue.id,
      )
    : undefined;
  const selectedDialogue = selectedFile?.startsWith("dialogues/")
    ? snapshot?.project.dialogues.find((item) =>
        snapshot.project.manifest.dialogues.some(
          (entry) => entry.id === item.id && entry.path === selectedFile,
        ),
      )
    : undefined;
  const selectedResource = selectedFile?.startsWith("definitions/")
    ? selectedFile.split("/").at(-1)?.replace(".json", "")
    : undefined;
  const resourcePreview = selectedResource
    ? snapshot?.project.resources[
        selectedResource === "characters"
          ? "characters"
          : selectedResource === "variables"
            ? "variables"
            : selectedResource === "events"
              ? "events"
              : "tags"
      ]
    : undefined;

  return (
    <section className="recovery-view">
      <header className="workspace-heading">
        <div>
          <small>PROJECT HISTORY</small>
          <h2>快照历史</h2>
          <p>按文件查看变更版本，保留最近 7 天内的版本，最多 100 份。</p>
        </div>
        <span className="recovery-count">{items.length} 份</span>
      </header>
      <div className="recovery-layout">
        <aside className="recovery-list" aria-label="快照列表">
          {loadingList && <p className="recovery-empty">正在读取快照…</p>}
          {!loadingList && items.length === 0 && (
            <p className="recovery-empty">当前项目还没有快照。</p>
          )}
          {!loadingList && files.length > 0 && (
            <label className="recovery-file-select">
              <span>项目文件</span>
              <select
                value={selectedFile ?? ""}
                onChange={(event) => {
                  const path = event.target.value;
                  setSelectedFile(path);
                  setSelectedId(
                    items.find((item) => item.changedFiles.includes(path))
                      ?.snapshotId ?? null,
                  );
                }}
              >
                {files.map((path) => <option key={path} value={path}>{path}</option>)}
              </select>
            </label>
          )}
          {fileVersions.map((item) => (
            <button
              className={`recovery-item ${selectedId === item.snapshotId ? "is-active" : ""}`}
              key={item.snapshotId}
              onClick={() => setSelectedId(item.snapshotId)}
            >
              <span className="recovery-item-top">
                <strong>
                  {new Date(item.createdAtUnixMs).toLocaleString()}
                </strong>
                <small>{item.isSaved ? "已保存" : "未保存"}</small>
              </span>
              <span className="recovery-item-meta">
                {item.isSaved ? "已保存版本" : "未保存版本"}
              </span>
            </button>
          ))}
        </aside>
        <div className="recovery-preview">
          {error && (
            <p className="recovery-error" role="alert">
              {error}
            </p>
          )}
          {loadingSnapshot && (
            <div className="recovery-loading" role="status">
              <LoaderCircle size={17} className="recovery-spinner" />
              <span>正在读取快照内容…</span>
            </div>
          )}
          {!loadingSnapshot && snapshot && (
            <>
              <div className="recovery-preview-heading">
                <div>
                  <small>
                    {selectedSummary?.isSaved ? "已保存版本" : "恢复点"}
                  </small>
                  <h3>{selectedFile}</h3>
                </div>
                <button
                  className="button button--primary"
                  disabled={!selectedSummary}
                  onClick={() => selectedFile && onRestore(snapshot, selectedFile)}
                  title="将此快照恢复到编辑器"
                >
                  <RotateCcw size={14} />
                  恢复此文件版本
                </button>
              </div>
              {selectedFile?.startsWith("dialogues/") && <div className="recovery-dialogue-select">
                <label htmlFor="recovery-dialogue">预览对话</label>
                <select
                  id="recovery-dialogue"
                  value={selectedDialogue?.id ?? dialogueId}
                  onChange={(event) => setDialogueId(event.target.value)}
                >
                  {snapshot.project.dialogues.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name || item.key}
                    </option>
                  ))}
                </select>
                <span>{selectedFile || entry?.path}</span>
              </div>}
              {selectedFile === ".siming/project.json" ? (
                <pre className="recovery-file-preview">{JSON.stringify(snapshot.project.manifest, null, 2)}</pre>
              ) : selectedResource ? (
                <pre className="recovery-file-preview">{JSON.stringify(resourcePreview, null, 2)}</pre>
              ) : selectedFile?.startsWith("dialogues/") ? <div className="recovery-node-list">
                {nodes.map((node, index) => {
                  const text =
                    node.type === "dialogue"
                      ? plainText(
                          node.data.text?.[
                            snapshot.project.manifest.defaultLocale
                          ],
                        )
                      : node.type === "choice"
                        ? node.data.choices
                            ?.map((choice) =>
                              plainText(
                                choice.text[
                                  snapshot.project.manifest.defaultLocale
                                ],
                              ),
                            )
                            .join(" / ")
                        : node.type === "condition"
                          ? (node.data.switch?.variable ??
                            conditionLabel(node.data.condition))
                          : node.type === "event"
                            ? node.data.hostEvents
                                ?.map((event) => event.name)
                                .join(", ")
                            : "";
                  return (
                    <article className="recovery-node" key={node.id}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <strong>{node.alias || node.key || node.type}</strong>
                        <small>
                          {node.type}
                          {node.data.speakerId
                            ? ` · ${node.data.speakerId}`
                            : ""}
                        </small>
                        {text && <p>{text}</p>}
                      </div>
                    </article>
                  );
                })}
                {nodes.length === 0 && (
                  <p className="recovery-empty">此对话没有节点。</p>
                )}
              </div> : <p className="recovery-empty">此文件版本没有可预览的结构化内容。</p>}
            </>
          )}
          {!loadingSnapshot && !snapshot && !error && (
            <div className="recovery-placeholder">
              <History size={24} />
              <span>选择一个快照以预览内容</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function errorText(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return typeof error === "string" ? error : "读取快照失败。";
}

function conditionLabel(condition: unknown): string {
  if (!condition || typeof condition !== "object") return "条件节点";
  if ("variable" in condition && typeof condition.variable === "string") {
    return condition.variable;
  }
  return "复合条件";
}
