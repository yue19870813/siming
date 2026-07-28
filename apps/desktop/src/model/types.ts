export type NodeType =
  "start" | "dialogue" | "choice" | "condition" | "event" | "end";

export type LocalizedText = Record<string, string>;

export type HostEvent = {
  name: string;
  payload: Record<string, unknown>;
};

export type ChoiceOption = {
  id: string;
  text: LocalizedText;
};

export type ComparisonOperator = "==" | "!=" | ">" | ">=" | "<" | "<=";

export type ConditionExpression =
  | {
      variable: string;
      operator: ComparisonOperator;
      value: boolean | number | string;
    }
  | { all: ConditionExpression[] }
  | { any: ConditionExpression[] }
  | { not: ConditionExpression };

export type DialogueNodeData = {
  text?: LocalizedText;
  speakerId?: string;
  choices?: ChoiceOption[];
  condition?: ConditionExpression;
  event?: string;
  params?: Record<string, unknown>;
  hostEvents?: HostEvent[];
  advancePolicy?: { mode: "manual" } | { mode: "auto"; delayMs: number };
  tags?: string[];
};

export type DialogueNode = {
  id: string;
  key: string;
  type: NodeType;
  position: { x: number; y: number };
  data: DialogueNodeData;
};

export type DialogueEdge = {
  id: string;
  sourceNodeId: string;
  sourcePort: string;
  targetNodeId: string;
  targetPort: string;
};

export type DialogueDocument = {
  schemaVersion: number;
  id: string;
  key: string;
  name: string;
  description: string;
  tags: string[];
  entryNodeId: string;
  nodes: DialogueNode[];
  edges: DialogueEdge[];
};

export type DialogueIndexEntry = {
  id: string;
  key: string;
  path: string;
};

export type CharacterDefinition = {
  id: string;
  key: string;
  name: LocalizedText;
  color: string;
  description: string;
  tags: string[];
};

export type VariableDefinition = {
  id: string;
  key: string;
  type: "boolean" | "number" | "string";
  defaultValue: boolean | number | string;
  description: string;
};

export type EventParameter = {
  key: string;
  type: "boolean" | "number" | "string";
  required: boolean;
  defaultValue?: boolean | number | string;
  description: string;
};

export type EventDefinition = {
  id: string;
  key: string;
  name: LocalizedText;
  description: string;
  params: EventParameter[];
};

export type TagDefinition = {
  id: string;
  key: string;
  name: string;
  color: string;
  scopes: Array<"dialogue" | "node" | "resource">;
  description: string;
};

export type ProjectSnapshot = {
  rootPath: string;
  manifest: {
    schemaVersion: number;
    projectId: string;
    name: string;
    paths: {
      dialogues: string;
      exports: string;
    };
    defaultExportFormat: "json";
    defaultLocale: string;
    locales: string[];
    dialogueDirectories: string[];
    dialogues: DialogueIndexEntry[];
  };
  dialogues: DialogueDocument[];
  resources: {
    characters: CharacterDefinition[];
    variables: VariableDefinition[];
    events: EventDefinition[];
    tags: TagDefinition[];
  };
};

export type SystemSettings = {
  schemaVersion: number;
  theme: "dark" | "light";
  defaultProjectDirectory: string | null;
  interfaceLocale: "zh-CN" | "en-US";
  uiFontSize: "small" | "medium" | "large";
  editorFontSize: number;
  keymap: "system" | "macos" | "windows";
  autoSaveDelaySeconds: number;
  recoverySnapshotIntervalSeconds: number;
  restoreLastProject: boolean;
  lastProjectPath: string | null;
  projectExportDirectories: Record<string, string>;
};

export type ExportResult = {
  outputDirectory: string;
  files: Array<{
    path: string;
    sha256: string;
    bytes: number;
  }>;
};

export type MigrationReport = {
  currentSchemaVersion: number;
  targetSchemaVersion: number;
  required: boolean;
  changes: Array<{
    file: string;
    description: string;
  }>;
  backupDirectory?: string;
};

export type RecoverySourceDraft = {
  dialogueId: string;
  source: string;
};

export type RecoverySnapshot = {
  schemaVersion: number;
  projectId: string;
  projectRoot: string;
  savedFingerprint: string;
  project: ProjectSnapshot;
  sourceDraft?: RecoverySourceDraft;
  createdAtUnixMs: number;
  appVersion: string;
};

export type Diagnostic = {
  code: string;
  severity: "error" | "warning";
  message: string;
  file: string;
  entityType?: "dialogue" | "node" | "edge" | "resource" | "locale" | null;
  entityId?: string | null;
  fieldPath?: string | null;
  range?: {
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
  } | null;
  related: Array<{
    file: string;
    entityId?: string | null;
    fieldPath?: string | null;
  }>;
};

export type SimulationAction =
  | { type: "start"; startNodeId?: string; locale: string }
  | { type: "continue" }
  | { type: "choose"; optionId: string }
  | {
      type: "setVariable";
      key: string;
      value: boolean | number | string;
    }
  | { type: "setLocale"; locale: string };

export type SimulationLogEntry = {
  sequence: number;
  kind:
    | "node"
    | "condition"
    | "choice"
    | "businessEvent"
    | "hostEvent"
    | "localeFallback"
    | "variable"
    | "system";
  nodeId?: string | null;
  nodeKey?: string | null;
  message: string;
  details: unknown;
};

export type SimulationSession = {
  currentNodeId?: string | null;
  status:
    | "running"
    | "waitingContinue"
    | "waitingChoice"
    | "completed"
    | "loopGuard"
    | "error";
  locale: string;
  variables: Record<string, boolean | number | string>;
  consecutiveSteps: number;
  visitSequence: number;
  trace: SimulationLogEntry[];
  error?: string | null;
};

export type SimulationRequest = {
  manifest: ProjectSnapshot["manifest"];
  dialogue: DialogueDocument;
  resources: ProjectSnapshot["resources"];
  session?: SimulationSession;
  action: SimulationAction;
};

export type ViewMode = "canvas" | "table" | "data";
export type Activity =
  | "welcome"
  | "project"
  | "search"
  | "characters"
  | "variables"
  | "events"
  | "tags"
  | "settings";
