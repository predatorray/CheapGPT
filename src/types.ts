export type ToolId =
  | 'wikipedia'
  | 'github'
  | 'places'
  | 'weather'
  | 'ip'
  | 'currency'
  | 'website'
  | 'calculator'
  | 'datetime';
export type ToolChoice = 'none' | 'auto' | ToolId;
export interface Source {
  title: string;
  url: string;
  detail: string;
  location?: { latitude: number; longitude: number };
}
export interface ToolResult {
  unavailable?: boolean;
  tool: ToolId;
  summary: string;
  sources: Source[];
}
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  result?: ToolResult;
  elapsed?: number;
  interrupted?: boolean;
  error?: boolean;
}
export interface Conversation {
  id: string;
  title: string;
  titleManual?: boolean;
  titleRound?: number;
  titleStable?: boolean;
  updatedAt: number;
  messages: Message[];
}
export type ModelStatus =
  | 'checking'
  | 'unsupported'
  | 'unavailable'
  | 'downloadable'
  | 'downloading'
  | 'available'
  | 'ready'
  | 'error';
export interface Prompt {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
export interface ModelSession {
  readonly contextUsage?: number;
  readonly contextWindow?: number;
  measureContextUsage?(
    input: Prompt[] | string,
    options?: { signal?: AbortSignal },
  ): Promise<number>;
  prompt(
    input: Prompt[] | string,
    options?: { signal?: AbortSignal; responseConstraint?: object },
  ): Promise<string>;
  promptStreaming(
    input: Prompt[] | string,
    options?: { signal?: AbortSignal },
  ): AsyncIterable<string>;
  clone(options?: { signal?: AbortSignal }): Promise<ModelSession>;
  destroy(): void;
}
export interface ModelFactory {
  availability(
    options?: object,
  ): Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>;
  create(options?: {
    signal?: AbortSignal;
    initialPrompts?: Prompt[];
    expectedInputs?: { type: 'text'; languages: string[] }[];
    expectedOutputs?: { type: 'text'; languages: string[] }[];
    monitor?: (monitor: {
      addEventListener(
        type: string,
        listener: (event: { loaded: number; total?: number }) => void,
      ): void;
    }) => void;
  }): Promise<ModelSession>;
}
declare global {
  interface Window {
    LanguageModel?: ModelFactory;
  }
}
