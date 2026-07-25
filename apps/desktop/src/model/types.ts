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

export type DialogueNodeData = {
  text?: LocalizedText;
  speakerId?: string;
  choices?: ChoiceOption[];
  condition?: {
    variable: string;
    operator: "==" | "!=" | ">" | ">=" | "<" | "<=";
    value: boolean | number | string;
  };
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
  editorFontSize: number;
  keymap: "system" | "macos" | "windows";
  autoSaveDelaySeconds: number;
  recoverySnapshotIntervalSeconds: number;
  restoreLastProject: boolean;
};

export type ViewMode = "canvas" | "table" | "data";
export type Activity =
  | "project"
  | "search"
  | "characters"
  | "variables"
  | "events"
  | "tags"
  | "settings";
