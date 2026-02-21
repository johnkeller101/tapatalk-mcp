export interface PaginationMeta {
  total?: number;
  page?: number;
  per_page?: number;
  has_more?: boolean;
  search_id?: string;
}

export function jsonResponse(
  data: Record<string, unknown>,
  meta?: PaginationMeta,
) {
  const payload: Record<string, unknown> = { ...data };
  if (meta) {
    const cleanMeta: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(meta)) {
      if (v !== undefined && v !== null) cleanMeta[k] = v;
    }
    if (Object.keys(cleanMeta).length > 0) {
      payload.meta = cleanMeta;
    }
  }
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
  };
}

export function jsonError(message: string, details?: Record<string, unknown>) {
  const error: Record<string, unknown> = { error: message };
  if (details) Object.assign(error, details);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(error) }],
    isError: true as const,
  };
}
