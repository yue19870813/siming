import { CornerDownRight, GitMerge, RotateCcw } from "lucide-react";
import type { DialogueDocument, DialogueNode } from "../model/types";
import { useEditorStore } from "../store/editorStore";

type Row = {
  node: DialogueNode;
  path: string;
  depth: number;
  marker?: "merge" | "loop";
};

function orderedRows(dialogue: DialogueDocument): Row[] {
  const nodes = new Map(dialogue.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, typeof dialogue.edges>();
  for (const edge of dialogue.edges) {
    const list = outgoing.get(edge.sourceNodeId) ?? [];
    list.push(edge);
    outgoing.set(edge.sourceNodeId, list);
  }
  const visited = new Set<string>();
  const active = new Set<string>();
  const rows: Row[] = [];

  function visit(id: string, path: string, depth: number) {
    const node = nodes.get(id);
    if (!node) return;
    if (active.has(id)) {
      rows.push({ node, path, depth, marker: "loop" });
      return;
    }
    if (visited.has(id)) {
      rows.push({ node, path, depth, marker: "merge" });
      return;
    }
    visited.add(id);
    active.add(id);
    rows.push({ node, path, depth });

    const edges = [...(outgoing.get(id) ?? [])].sort((a, b) => {
      if (node.type === "condition") {
        return a.sourcePort === "true" ? -1 : b.sourcePort === "true" ? 1 : 0;
      }
      if (node.type === "choice") {
        const order = node.data.choices?.map((item) => item.id) ?? [];
        return order.indexOf(a.sourcePort) - order.indexOf(b.sourcePort);
      }
      return 0;
    });
    edges.forEach((edge, index) => {
      const branch =
        node.type === "condition"
          ? edge.sourcePort.toUpperCase()
          : node.type === "choice"
            ? String.fromCharCode(65 + index)
            : path;
      visit(edge.targetNodeId, branch || path, depth + 1);
    });
    active.delete(id);
  }

  visit(dialogue.entryNodeId, "MAIN", 0);
  for (const node of dialogue.nodes) {
    if (!visited.has(node.id)) rows.push({ node, path: "未连接", depth: 0 });
  }
  return rows;
}

export function TableView() {
  const project = useEditorStore((state) => state.project);
  const dialogueId = useEditorStore((state) => state.selectedDialogueId);
  const locale = useEditorStore((state) => state.previewLocale);
  const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
  const setSelectedNode = useEditorStore((state) => state.setSelectedNode);
  const dialogue = project.dialogues.find((item) => item.id === dialogueId);
  if (!dialogue) return null;
  const rows = orderedRows(dialogue);

  return (
    <div className="table-view">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>路径</th>
            <th>类型 / Key</th>
            <th>角色与正文</th>
            <th>下一步</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const text =
              row.node.data.text?.[locale] ??
              Object.values(row.node.data.text ?? {})[0] ??
              (row.node.type === "choice"
                ? `${row.node.data.choices?.length ?? 0} 个选项`
                : "");
            const next = dialogue.edges
              .filter((edge) => edge.sourceNodeId === row.node.id)
              .map((edge) => edge.sourcePort)
              .join(" / ");
            return (
              <tr
                key={`${row.node.id}-${index}`}
                className={
                  selectedNodeId === row.node.id ? "is-selected" : undefined
                }
                onClick={() => setSelectedNode(row.node.id)}
              >
                <td>{index + 1}</td>
                <td>
                  <span
                    className={`path-badge path-badge--${row.path.toLowerCase()}`}
                  >
                    {row.path}
                  </span>
                </td>
                <td>
                  <div
                    className="tree-indent"
                    style={{ paddingLeft: row.depth * 14 }}
                  >
                    {row.marker === "merge" ? (
                      <GitMerge size={13} />
                    ) : row.marker === "loop" ? (
                      <RotateCcw size={13} />
                    ) : (
                      <CornerDownRight size={13} />
                    )}
                    <strong>{row.node.type}</strong>
                    <small>{row.node.key}</small>
                  </div>
                </td>
                <td>
                  {row.node.data.speakerId && (
                    <strong>{row.node.data.speakerId} · </strong>
                  )}
                  {text}
                </td>
                <td>{row.marker ? `引用 ${row.node.key}` : next || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
