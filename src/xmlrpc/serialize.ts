/**
 * XML-RPC serialization: JS values → XML-RPC <methodCall> XML.
 *
 * Tapatalk quirk: most string parameters are typed as `byte[]` in their API,
 * which means XML-RPC <base64>. We handle this by accepting a paramTypes array
 * that specifies which params should be encoded as base64.
 */

export type ParamType = "string" | "base64" | "int" | "boolean" | "auto";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function serializeValue(value: unknown, type: ParamType = "auto"): string {
  if (value === null || value === undefined) {
    return "<value><string></string></value>";
  }

  // Explicit base64 encoding for Tapatalk byte[] params
  if (type === "base64") {
    const str = String(value);
    const encoded = Buffer.from(str, "utf-8").toString("base64");
    return `<value><base64>${encoded}</base64></value>`;
  }

  if (type === "int" || (type === "auto" && typeof value === "number")) {
    const n = typeof value === "number" ? value : Number(value);
    if (Number.isInteger(n)) {
      return `<value><int>${n}</int></value>`;
    }
    return `<value><double>${n}</double></value>`;
  }

  if (type === "boolean" || (type === "auto" && typeof value === "boolean")) {
    return `<value><boolean>${value ? 1 : 0}</boolean></value>`;
  }

  if (type === "string" || (type === "auto" && typeof value === "string")) {
    return `<value><string>${escapeXml(String(value))}</string></value>`;
  }

  if (type === "auto" && value instanceof Date) {
    return `<value><dateTime.iso8601>${value.toISOString()}</dateTime.iso8601></value>`;
  }

  if (type === "auto" && Array.isArray(value)) {
    const items = value.map((v) => serializeValue(v, "auto")).join("");
    return `<value><array><data>${items}</data></array></value>`;
  }

  if (type === "auto" && typeof value === "object") {
    let members = "";
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      members += `<member><name>${escapeXml(k)}</name>${serializeValue(v, "auto")}</member>`;
    }
    return `<value><struct>${members}</struct></value>`;
  }

  // Fallback: treat as string
  return `<value><string>${escapeXml(String(value))}</string></value>`;
}

export function buildMethodCall(
  method: string,
  params: unknown[],
  paramTypes?: ParamType[],
): string {
  let paramsXml = "";
  if (params.length > 0) {
    const paramEntries = params.map((p, i) => {
      const type = paramTypes?.[i] ?? "auto";
      return `<param>${serializeValue(p, type)}</param>`;
    });
    paramsXml = `<params>${paramEntries.join("")}</params>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?><methodCall><methodName>${escapeXml(method)}</methodName>${paramsXml}</methodCall>`;
}
