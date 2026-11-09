import {
  routeEdges,
  requestsForNodes,
  roundedPath,
  type Obstacle,
  type RouteRequest,
} from "./edgeRouting";

type RouteResult = {
  requestId: number;
  snapshot: string;
  complete: boolean;
  paths: [string, string | null][];
};

let worker: Worker | null = null;
let requestId = 0;
let requestedSnapshot = "";
let activeSnapshot = "";
let workerBusy = false;
let cachedSnapshot = "";
let cachedScope: string | undefined;
let cachedPaths = new Map<string, string>();
let cachedEdgeIds = new Set<string>();
let version = 0;
const listeners = new Set<() => void>();

export function subscribeToRoutes(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRouteVersion() {
  return version;
}

export function getRoutedPath(scope: string | undefined, edgeId: string) {
  return scope === cachedScope ? cachedPaths.get(edgeId) : undefined;
}

function publish(
  snapshot: string,
  paths: Map<string, string>,
  complete: boolean,
  updatedEdgeIds: string[] = [],
) {
  if (snapshot !== requestedSnapshot) return;
  cachedSnapshot = snapshot;
  if (complete) {
    cachedPaths = paths;
  } else {
    for (const edgeId of updatedEdgeIds) cachedPaths.delete(edgeId);
    for (const [edgeId, path] of paths) cachedPaths.set(edgeId, path);
  }
  version += 1;
  listeners.forEach((listener) => listener());
}

function calculateOnMainThread(snapshot: string) {
  const { nodes, requests, draggingNodeIds } = JSON.parse(
    snapshot,
  ) as {
    nodes: Obstacle[];
    requests: RouteRequest[];
    draggingNodeIds: string[];
  };
  const complete = draggingNodeIds.length === 0;
  const selectedRequests = complete
    ? requests
    : requestsForNodes(requests, draggingNodeIds);
  const routes = [...routeEdges(selectedRequests, nodes)];
  publish(
    snapshot,
    new Map(
      routes.flatMap(([id, path]) =>
        path ? [[id, roundedPath(path)] as const] : [],
      ),
    ),
    complete,
    routes.map(([id]) => id),
  );
}

export function requestRoutes(snapshot: string) {
  if (snapshot === requestedSnapshot) return;
  if (snapshot === cachedSnapshot && !workerBusy) {
    requestedSnapshot = snapshot;
    return;
  }
  const {
    requests,
    dialogueId,
  } = JSON.parse(snapshot) as {
    requests: RouteRequest[];
    draggingNodeIds?: string[];
    dialogueId?: string;
  };
  const edgeIds = new Set(requests.map(({ id }) => id));
  if (
    dialogueId !== cachedScope ||
    edgeIds.size !== cachedEdgeIds.size ||
    [...edgeIds].some((id) => !cachedEdgeIds.has(id))
  ) {
    cachedPaths = new Map();
    cachedEdgeIds = edgeIds;
    cachedScope = dialogueId;
  }
  requestedSnapshot = snapshot;
  if (typeof Worker === "undefined") {
    calculateOnMainThread(snapshot);
    return;
  }
  try {
    worker ??= new Worker(new URL("./edgeRouting.worker.ts", import.meta.url), {
      type: "module",
    });
  } catch {
    worker = null;
    calculateOnMainThread(snapshot);
    return;
  }
  if (workerBusy) return;
  dispatchWorker(snapshot);
}

function dispatchWorker(snapshot: string) {
  if (!worker) return;
  const id = ++requestId;
  activeSnapshot = snapshot;
  workerBusy = true;
  worker.onmessage = ({ data }: MessageEvent<RouteResult>) => {
    workerBusy = false;
    if (
      data.requestId === requestId &&
      data.snapshot === activeSnapshot &&
      data.snapshot === requestedSnapshot
    ) {
      publish(
        data.snapshot,
        new Map(
          data.paths.flatMap(([edgeId, path]) =>
            path ? [[edgeId, path] as const] : [],
          ),
        ),
        data.complete,
        data.paths.map(([edgeId]) => edgeId),
      );
    }
    if (requestedSnapshot !== cachedSnapshot) dispatchWorker(requestedSnapshot);
  };
  worker.onerror = () => {
    worker?.terminate();
    worker = null;
    workerBusy = false;
    if (requestedSnapshot) calculateOnMainThread(requestedSnapshot);
  };
  try {
    worker.postMessage({ requestId: id, snapshot });
  } catch {
    worker.terminate();
    worker = null;
    workerBusy = false;
    calculateOnMainThread(snapshot);
  }
}
