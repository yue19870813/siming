import {
  BaseEdge,
  getSmoothStepPath,
  useStore,
  type EdgeProps,
  type ReactFlowState,
} from "@xyflow/react";
import {
  routeEdges,
  roundedPath,
  type Obstacle,
  type RouteRequest,
} from "./edgeRouting";

// Subscribe to geometry only: selecting an edge does not recompute lane routes.
function geometrySnapshot(state: ReactFlowState) {
  const nodes: Obstacle[] = [];
  for (const node of state.nodeLookup.values()) {
    if (node.hidden) continue;
    nodes.push({
      ...node.internals.positionAbsolute,
      width: node.measured.width ?? 210,
      height: node.measured.height ?? 86,
    });
  }
  const requests: RouteRequest[] = [];
  for (const edge of state.edges) {
    if (edge.hidden) continue;
    const source = state.nodeLookup.get(edge.source),
      target = state.nodeLookup.get(edge.target);
    const from = source?.internals.handleBounds?.source?.find(
      (h) => h.id === edge.sourceHandle,
    );
    const to = target?.internals.handleBounds?.target?.find(
      (h) => h.id === edge.targetHandle,
    );
    if (!source || !target || source.hidden || target.hidden || !from || !to)
      continue;
    requests.push({
      id: edge.id,
      source: {
        x: source.internals.positionAbsolute.x + from.x + from.width,
        y: source.internals.positionAbsolute.y + from.y + from.height / 2,
      },
      target: {
        x: target.internals.positionAbsolute.x + to.x,
        y: target.internals.positionAbsolute.y + to.y + to.height / 2,
      },
    });
  }
  return JSON.stringify({ nodes, requests });
}

// All edge components share one routing pass for the same canvas geometry.
let cachedSnapshot = "";
let cachedPaths = new Map<string, string>();
function pathsFor(snapshot: string) {
  if (snapshot !== cachedSnapshot) {
    const { nodes, requests } = JSON.parse(snapshot) as {
      nodes: Obstacle[];
      requests: RouteRequest[];
    };
    cachedPaths = new Map(
      [...routeEdges(requests, nodes)].flatMap(([id, path]) =>
        path ? [[id, roundedPath(path)] as const] : [],
      ),
    );
    cachedSnapshot = snapshot;
  }
  return cachedPaths;
}

export function RoutedEdge(props: EdgeProps) {
  const snapshot = useStore(geometrySnapshot);
  return (
    <BaseEdge
      id={props.id}
      path={
        pathsFor(snapshot).get(props.id) ??
        getSmoothStepPath({ ...props, offset: 32, borderRadius: 8 })[0]
      }
      markerEnd={props.markerEnd}
      style={props.style}
      interactionWidth={24}
    />
  );
}
