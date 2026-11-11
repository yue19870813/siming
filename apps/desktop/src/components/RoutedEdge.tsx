import {
  BaseEdge,
  getBezierPath,
  getSmoothStepPath,
  useStore,
  type EdgeProps,
  type ReactFlowState,
} from "@xyflow/react";
import { useEffect, useSyncExternalStore } from "react";
import type { Obstacle, RouteRequest } from "./edgeRouting";
import {
  getRouteVersion,
  getRoutedPath,
  requestRoutes,
  subscribeToRoutes,
} from "./edgeRoutingClient";

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
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
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
  const routingData =
    (state.edges[0]?.data as
      { dialogueId?: string; draggingNodeIds?: string[] } | undefined) ?? {};
  return JSON.stringify({
    nodes,
    requests,
    dialogueId: routingData.dialogueId,
    draggingNodeIds: routingData.draggingNodeIds ?? [],
  });
}

// One subscription per canvas, rather than rebuilding the entire geometry for
// every edge on every React Flow store update.
export function EdgeRoutingCoordinator() {
  const snapshot = useStore(geometrySnapshot);
  useEffect(() => requestRoutes(snapshot), [snapshot]);
  return null;
}

export function RoutedEdge(props: EdgeProps) {
  const scope = (props.data as { dialogueId?: string } | undefined)?.dialogueId;
  useSyncExternalStore(subscribeToRoutes, getRouteVersion, getRouteVersion);
  return (
    <BaseEdge
      id={props.id}
      path={
        getRoutedPath(scope, props.id) ??
        getSmoothStepPath({ ...props, offset: 32, borderRadius: 8 })[0]
      }
      markerEnd={props.markerEnd}
      style={props.style}
      interactionWidth={24}
    />
  );
}

export function CurvedEdge(props: EdgeProps) {
  const [path] = getBezierPath({ ...props, curvature: 0.5 });
  return (
    <BaseEdge
      id={props.id}
      path={path}
      markerStart={props.markerStart}
      markerEnd={props.markerEnd}
      style={props.style}
      interactionWidth={24}
    />
  );
}
