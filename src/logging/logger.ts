/**
 * Lightweight console logger — no pino/winston. Format:
 * `[2026-07-23T23:45:00.000Z] [INFO] [ingest_xml] mensagem {chatId: -123, durationMs: 40}`
 */

export type LogLevel = "INFO" | "WARN" | "ERROR";

export type LogContext = Record<string, unknown>;

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Error) {
    return JSON.stringify(value.message);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function formatLogContext(context?: LogContext): string {
  if (!context) {
    return "";
  }
  const keys = Object.keys(context);
  if (keys.length === 0) {
    return "";
  }
  const body = keys.map((key) => `${key}: ${formatValue(context[key])}`).join(", ");
  return ` {${body}}`;
}

export function formatLogLine(
  level: LogLevel,
  scope: string,
  message: string,
  context?: LogContext,
  now: Date = new Date(),
): string {
  return `[${now.toISOString()}] [${level}] [${scope}] ${message}${formatLogContext(context)}`;
}

function write(level: LogLevel, scope: string, message: string, context?: LogContext): void {
  const line = formatLogLine(level, scope, message, context);
  if (level === "ERROR") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const log = {
  info(scope: string, message: string, context?: LogContext): void {
    write("INFO", scope, message, context);
  },
  warn(scope: string, message: string, context?: LogContext): void {
    write("WARN", scope, message, context);
  },
  error(scope: string, message: string, context?: LogContext): void {
    write("ERROR", scope, message, context);
  },
};

/** Serialize an unknown thrown value for structured log context. */
export function errorContext(error: unknown): LogContext {
  if (error instanceof Error) {
    return { error: error.message, stack: error.stack };
  }
  return { error: String(error) };
}
