// Shared envelope used for `--json` mode across CLI commands and the MCP server.
// Stable shape — change with care; agent integrations depend on this.

export interface AgentEnvelope<T = unknown> {
  ok: boolean;
  command: string;
  data?: T;
  error?: {
    code: string;
    message: string;
    hint?: string;
  };
  nextAction?: string;
}

export function ok<T>(command: string, data: T, nextAction?: string): AgentEnvelope<T> {
  return nextAction ? { ok: true, command, data, nextAction } : { ok: true, command, data };
}

export function fail(command: string, code: string, message: string, hint?: string, nextAction?: string): AgentEnvelope<never> {
  const env: AgentEnvelope<never> = { ok: false, command, error: hint ? { code, message, hint } : { code, message } };
  if (nextAction) env.nextAction = nextAction;
  return env;
}

export function emit(env: AgentEnvelope): void {
  process.stdout.write(JSON.stringify(env) + "\n");
}

export function emitOk<T>(command: string, data: T, nextAction?: string): void {
  emit(ok(command, data, nextAction));
}

export function emitFail(command: string, code: string, message: string, hint?: string, nextAction?: string): void {
  emit(fail(command, code, message, hint, nextAction));
}

export function wantsJson(flags: string[]): boolean {
  return flags.includes("--json");
}

export function wantsNdjson(flags: string[]): boolean {
  return flags.includes("--ndjson");
}
