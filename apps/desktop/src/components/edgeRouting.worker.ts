import {
  routeEdges,
  requestsForNodes,
  roundedPath,
  type Obstacle,
  type RouteRequest,
} from "./edgeRouting";

type RouteMessage = { requestId: number; snapshot: string };
type RouteResult = {
  requestId: number;
  snapshot: string;
  complete: boolean;
  paths: [string, string | null][];
};

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<RouteMessage>) => void) | null;
  postMessage: (message: RouteResult) => void;
};

scope.onmessage = ({ data }) => {
  const {
    nodes,
    requests,
    draggingNodeIds = [],
  } = JSON.parse(data.snapshot) as {
    nodes: Obstacle[];
    requests: RouteRequest[];
    draggingNodeIds?: string[];
  };
  const complete = draggingNodeIds.length === 0;
  const selectedRequests = complete
    ? requests
    : requestsForNodes(requests, draggingNodeIds);
  const paths = [...routeEdges(selectedRequests, nodes)].map(
    ([id, path]) =>
      [id, path ? roundedPath(path) : null] as [string, string | null],
  );
  scope.postMessage({
    requestId: data.requestId,
    snapshot: data.snapshot,
    complete,
    paths,
  });
};
