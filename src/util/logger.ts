export class Logger {
  info(msg: string, meta?: unknown): void {
    this.write("INFO", msg, meta);
  }

  warn(msg: string, meta?: unknown): void {
    this.write("WARN", msg, meta);
  }

  error(msg: string, meta?: unknown): void {
    this.write("ERROR", msg, meta);
  }

  debug(msg: string, meta?: unknown): void {
    this.write("DEBUG", msg, meta);
  }

  private write(level: string, msg: string, meta?: unknown): void {
    const ts = new Date().toISOString();
    let line = `[${ts}] ${level} ${msg}`;
    if (meta !== undefined) {
      line += " " + JSON.stringify(this.redact(meta));
    }
    process.stderr.write(line + "\n");
  }

  private redact(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === "string") return obj;
    if (typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map((v) => this.redact(v));

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const lk = key.toLowerCase();
      if (lk.includes("password") || lk.includes("passwd") || lk === "pass") {
        result[key] = "[REDACTED]";
      } else if (typeof value === "object" && value !== null) {
        result[key] = this.redact(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
}

export const logger = new Logger();
