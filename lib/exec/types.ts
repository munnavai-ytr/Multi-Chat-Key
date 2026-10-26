export type RiskClass =
  | 'read'
  | 'write'
  | 'install'
  | 'network'
  | 'destructive'
  | 'privileged'
  | 'secret';

export type Decision = 'auto' | 'ask' | 'deny';

export interface ExecOptions {
  cmd: string;
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  stdin?: string;
  signal?: AbortSignal;
  onData?: (chunk: string, stream: 'stdout' | 'stderr') => void;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
  truncated: boolean;
}

export interface ProcInfo {
  id: string;
  cmd: string;
  startedAt: number;
}

export interface RunnerBackend {
  id: 'browser' | 'remote';
  label: string;
  available(): Promise<{ ok: boolean; detail?: string }>;
  exec(o: ExecOptions): Promise<ExecResult>;
  startProcess?(o: ExecOptions): Promise<ProcInfo>;
  readProcess?(
    id: string,
    since: number
  ): Promise<{ data: string; cursor: number; exited: boolean; exitCode?: number | null }>;
  writeProcess?(id: string, data: string): Promise<void>;
  killProcess?(id: string): Promise<void>;
  listProcesses?(): Promise<ProcInfo[]>;
  exposePort?(port: number): Promise<{ url: string }>;
}
