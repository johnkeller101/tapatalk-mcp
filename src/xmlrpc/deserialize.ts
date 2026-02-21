/**
 * XML-RPC deserialization: XML-RPC <methodResponse> XML → JS values.
 *
 * Hand-written parser using string scanning. We avoid eval() and external
 * XML parsers to keep the attack surface minimal. This parser is strict:
 * malformed XML throws rather than guessing.
 */

export class XmlRpcFault extends Error {
  constructor(
    public faultCode: number,
    public faultString: string,
  ) {
    super(`XML-RPC Fault ${faultCode}: ${faultString}`);
    this.name = "XmlRpcFault";
  }
}

interface ParseContext {
  xml: string;
  pos: number;
}

function skipWhitespace(ctx: ParseContext): void {
  while (ctx.pos < ctx.xml.length && /\s/.test(ctx.xml[ctx.pos]!)) {
    ctx.pos++;
  }
}

function expect(ctx: ParseContext, str: string): void {
  skipWhitespace(ctx);
  if (!ctx.xml.startsWith(str, ctx.pos)) {
    throw new Error(`Malformed XML-RPC response: expected "${str}" at position ${ctx.pos}`);
  }
  ctx.pos += str.length;
}

function tryConsume(ctx: ParseContext, str: string): boolean {
  skipWhitespace(ctx);
  if (ctx.xml.startsWith(str, ctx.pos)) {
    ctx.pos += str.length;
    return true;
  }
  return false;
}

function readUntil(ctx: ParseContext, delimiter: string): string {
  const idx = ctx.xml.indexOf(delimiter, ctx.pos);
  if (idx === -1) {
    throw new Error(`Expected "${delimiter}" after position ${ctx.pos}`);
  }
  const result = ctx.xml.substring(ctx.pos, idx);
  ctx.pos = idx + delimiter.length;
  return result;
}

function unescapeXml(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function parseValue(ctx: ParseContext): unknown {
  skipWhitespace(ctx);
  expect(ctx, "<value>");
  skipWhitespace(ctx);

  let result: unknown;

  // Handle <value>text</value> (implicit string)
  if (!ctx.xml.startsWith("<", ctx.pos) || ctx.xml.startsWith("</value>", ctx.pos)) {
    const text = readUntil(ctx, "</value>");
    return unescapeXml(text.trim());
  }

  if (tryConsume(ctx, "<string>")) {
    result = unescapeXml(readUntil(ctx, "</string>"));
  } else if (tryConsume(ctx, "<base64>")) {
    const b64 = readUntil(ctx, "</base64>").trim();
    result = Buffer.from(b64, "base64").toString("utf-8");
  } else if (tryConsume(ctx, "<i4>")) {
    result = parseInt(readUntil(ctx, "</i4>"), 10);
  } else if (tryConsume(ctx, "<int>")) {
    result = parseInt(readUntil(ctx, "</int>"), 10);
  } else if (tryConsume(ctx, "<double>")) {
    result = parseFloat(readUntil(ctx, "</double>"));
  } else if (tryConsume(ctx, "<boolean>")) {
    const val = readUntil(ctx, "</boolean>").trim();
    result = val === "1" || val === "true";
  } else if (tryConsume(ctx, "<dateTime.iso8601>")) {
    result = readUntil(ctx, "</dateTime.iso8601>");
  } else if (tryConsume(ctx, "<array>")) {
    result = parseArray(ctx);
    expect(ctx, "</array>");
  } else if (tryConsume(ctx, "<struct>")) {
    result = parseStruct(ctx);
    expect(ctx, "</struct>");
  } else if (tryConsume(ctx, "<nil/>") || tryConsume(ctx, "<nil>")) {
    if (ctx.xml.startsWith("</nil>", ctx.pos)) {
      ctx.pos += 6;
    }
    result = null;
  } else {
    // Try to read as implicit string up to </value>
    const text = readUntil(ctx, "</value>");
    return unescapeXml(text.trim());
  }

  skipWhitespace(ctx);
  expect(ctx, "</value>");
  return result;
}

function parseArray(ctx: ParseContext): unknown[] {
  skipWhitespace(ctx);
  expect(ctx, "<data>");
  const items: unknown[] = [];
  skipWhitespace(ctx);
  while (!ctx.xml.startsWith("</data>", ctx.pos)) {
    items.push(parseValue(ctx));
    skipWhitespace(ctx);
  }
  expect(ctx, "</data>");
  return items;
}

function parseStruct(ctx: ParseContext): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  skipWhitespace(ctx);
  while (ctx.xml.startsWith("<member>", ctx.pos)) {
    expect(ctx, "<member>");
    skipWhitespace(ctx);
    expect(ctx, "<name>");
    const name = readUntil(ctx, "</name>");
    skipWhitespace(ctx);
    const value = parseValue(ctx);
    skipWhitespace(ctx);
    expect(ctx, "</member>");
    skipWhitespace(ctx);
    obj[name] = value;
  }
  return obj;
}

export function parseMethodResponse(xml: string): unknown {
  const ctx: ParseContext = { xml, pos: 0 };

  // Skip leading whitespace and XML declaration if present
  skipWhitespace(ctx);
  if (ctx.xml.startsWith("<?xml", ctx.pos)) {
    const end = xml.indexOf("?>", ctx.pos);
    if (end !== -1) ctx.pos = end + 2;
  }

  skipWhitespace(ctx);
  expect(ctx, "<methodResponse>");
  skipWhitespace(ctx);

  // Check for fault
  if (tryConsume(ctx, "<fault>")) {
    skipWhitespace(ctx);
    const faultValue = parseValue(ctx) as Record<string, unknown>;
    const code = (faultValue.faultCode as number) ?? 0;
    const str = (faultValue.faultString as string) ?? "Unknown fault";
    throw new XmlRpcFault(code, str);
  }

  // Normal response
  expect(ctx, "<params>");
  skipWhitespace(ctx);
  expect(ctx, "<param>");
  skipWhitespace(ctx);
  const result = parseValue(ctx);
  skipWhitespace(ctx);
  // Consume remaining closing tags tolerantly
  tryConsume(ctx, "</param>");
  skipWhitespace(ctx);
  tryConsume(ctx, "</params>");
  skipWhitespace(ctx);
  tryConsume(ctx, "</methodResponse>");

  return result;
}
