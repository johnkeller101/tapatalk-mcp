import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TapatalkClient } from "../tapatalk/client.js";
import { jsonResponse, jsonError } from "../util/response.js";

function paginationParams(page: number, perPage: number) {
  const startNum = (page - 1) * perPage;
  const lastNum = startNum + perPage - 1;
  return { startNum, lastNum };
}

export function registerTopicTools(
  server: McpServer,
  client: TapatalkClient,
): void {
  const readOnly = { readOnlyHint: true };

  // ── get_topics ──
  server.tool(
    "tapatalk_get_topics",
    "List topics in a specific forum. Returns topic IDs, titles, authors, reply counts, and short previews.",
    {
      forum_id: z.string().describe("Forum ID to list topics from"),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .default(1)
        .describe("Page number (1-based)"),
      per_page: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(20)
        .describe("Topics per page (max 50)"),
      mode: z
        .enum(["TOP", "ANN"])
        .optional()
        .describe("Filter: TOP for stickies, ANN for announcements"),
    },
    readOnly,
    async ({ forum_id, page, per_page, mode }) => {
      try {
        const { startNum, lastNum } = paginationParams(page, per_page);
        const result = await client.getTopics(forum_id, startNum, lastNum, mode);
        const topics = result.topics ?? [];
        const total = result.total_topic_num ?? topics.length;
        return jsonResponse(
          {
            forum_id: result.forum_id,
            forum_name: result.forum_name,
            can_post: result.can_post,
            topics,
          },
          {
            total,
            page,
            per_page,
            has_more: page * per_page < total,
          },
        );
      } catch (e) {
        return jsonError(`Failed to get topics: ${(e as Error).message}`);
      }
    },
  );

  // ── get_latest_topics ──
  server.tool(
    "tapatalk_get_latest_topics",
    "Get the latest topics across all forums, ordered by date.",
    {
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .default(1)
        .describe("Page number (1-based)"),
      per_page: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(20)
        .describe("Topics per page (max 50)"),
    },
    readOnly,
    async ({ page, per_page }) => {
      try {
        const { startNum, lastNum } = paginationParams(page, per_page);
        const result = await client.getLatestTopics(startNum, lastNum);
        const topics = result.topics ?? [];
        const total = result.total_topic_num ?? topics.length;
        return jsonResponse(
          { topics },
          {
            total,
            page,
            per_page,
            has_more: page * per_page < total,
          },
        );
      } catch (e) {
        return jsonError(
          `Failed to get latest topics: ${(e as Error).message}`,
        );
      }
    },
  );

  // ── get_unread_topics ──
  server.tool(
    "tapatalk_get_unread_topics",
    "Get unread topics for the logged-in user. Requires authentication.",
    {
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .default(1)
        .describe("Page number (1-based)"),
      per_page: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(20)
        .describe("Topics per page (max 50)"),
    },
    readOnly,
    async ({ page, per_page }) => {
      if (!client.isLoggedIn()) {
        return jsonError("Not logged in. Configure TAPATALK_USERNAME and TAPATALK_PASSWORD to use this tool.");
      }
      try {
        const { startNum, lastNum } = paginationParams(page, per_page);
        const result = await client.getUnreadTopics(startNum, lastNum);
        const topics = result.topics ?? [];
        const total = result.total_topic_num ?? topics.length;
        return jsonResponse(
          { topics },
          {
            total,
            page,
            per_page,
            has_more: page * per_page < total,
          },
        );
      } catch (e) {
        return jsonError(
          `Failed to get unread topics: ${(e as Error).message}`,
        );
      }
    },
  );

  // ── get_participated_topics ──
  server.tool(
    "tapatalk_get_participated_topics",
    "Get topics the logged-in user has participated in (posted or created). Requires authentication.",
    {
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .default(1)
        .describe("Page number (1-based)"),
      per_page: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(20)
        .describe("Topics per page (max 50)"),
    },
    readOnly,
    async ({ page, per_page }) => {
      if (!client.isLoggedIn()) {
        return jsonError("Not logged in. Configure TAPATALK_USERNAME and TAPATALK_PASSWORD to use this tool.");
      }
      try {
        const { startNum, lastNum } = paginationParams(page, per_page);
        const result = await client.getParticipatedTopics(startNum, lastNum);
        const topics = result.topics ?? [];
        const total = result.total_topic_num ?? topics.length;
        return jsonResponse(
          { topics },
          {
            total,
            page,
            per_page,
            has_more: page * per_page < total,
          },
        );
      } catch (e) {
        return jsonError(
          `Failed to get participated topics: ${(e as Error).message}`,
        );
      }
    },
  );
}
