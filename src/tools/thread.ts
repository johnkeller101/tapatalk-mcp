import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TapatalkClient } from "../tapatalk/client.js";
import { jsonResponse, jsonError } from "../util/response.js";

export function registerThreadTools(
  server: McpServer,
  client: TapatalkClient,
): void {
  const readOnly = { readOnlyHint: true };

  // ── get_thread ──
  server.tool(
    "tapatalk_get_thread",
    "Get posts in a topic thread. Returns post content, authors, timestamps, and attachments. Content is returned as-is from the forum (may contain BBCode or HTML).",
    {
      topic_id: z.string().describe("Topic ID to read"),
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
        .describe("Posts per page (max 50)"),
    },
    readOnly,
    async ({ topic_id, page, per_page }) => {
      try {
        const startNum = (page - 1) * per_page;
        const lastNum = startNum + per_page - 1;
        const result = await client.getThread(topic_id, startNum, lastNum);
        const posts = result.posts ?? [];
        const total = result.total_post_num ?? posts.length;
        return jsonResponse(
          {
            topic_id: result.topic_id,
            topic_title: result.topic_title,
            forum_id: result.forum_id,
            forum_name: result.forum_name,
            topic_author_name: result.topic_author_name,
            view_number: result.view_number,
            is_closed: result.is_closed,
            can_reply: result.can_reply,
            posts,
          },
          {
            total,
            page,
            per_page,
            has_more: page * per_page < total,
          },
        );
      } catch (e) {
        return jsonError(`Failed to get thread: ${(e as Error).message}`);
      }
    },
  );

  // ── get_thread_by_unread ──
  server.tool(
    "tapatalk_get_thread_by_unread",
    "Jump to the first unread post in a topic. Requires authentication for accurate unread tracking.",
    {
      topic_id: z.string().describe("Topic ID to read"),
    },
    readOnly,
    async ({ topic_id }) => {
      try {
        const result = await client.getThreadByUnread(topic_id);
        const posts = result.posts ?? [];
        const total = result.total_post_num ?? posts.length;
        return jsonResponse(
          {
            topic_id: result.topic_id,
            topic_title: result.topic_title,
            forum_id: result.forum_id,
            forum_name: result.forum_name,
            topic_author_name: result.topic_author_name,
            is_closed: result.is_closed,
            can_reply: result.can_reply,
            posts,
          },
          { total },
        );
      } catch (e) {
        return jsonError(
          `Failed to get thread by unread: ${(e as Error).message}`,
        );
      }
    },
  );
}
