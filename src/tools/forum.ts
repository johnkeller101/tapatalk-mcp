import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TapatalkClient } from "../tapatalk/client.js";
import { jsonResponse, jsonError } from "../util/response.js";

export function registerForumTools(
  server: McpServer,
  client: TapatalkClient,
): void {
  const readOnly = { readOnlyHint: true };

  // ── get_config ──
  server.tool(
    "tapatalk_get_config",
    "Get forum configuration, capabilities, and Tapatalk plugin version. Use this to verify connectivity and discover what features the forum supports.",
    {},
    readOnly,
    async () => {
      try {
        const config = await client.getConfig();
        return jsonResponse({ config });
      } catch (e) {
        return jsonError(`Failed to get config: ${(e as Error).message}`);
      }
    },
  );

  // ── get_forum ──
  server.tool(
    "tapatalk_get_forum",
    "List forums and subforums in a tree structure. Returns forum IDs needed for browsing topics.",
    {
      include_description: z
        .boolean()
        .optional()
        .default(false)
        .describe("Include forum descriptions"),
      forum_id: z
        .string()
        .optional()
        .describe("Get only children of this forum ID. Omit for all forums."),
    },
    readOnly,
    async ({ include_description, forum_id }) => {
      try {
        const forums = await client.getForum(include_description, forum_id);
        return jsonResponse({ forums }, { total: forums.length });
      } catch (e) {
        return jsonError(`Failed to get forums: ${(e as Error).message}`);
      }
    },
  );

  // ── get_board_stats ──
  server.tool(
    "tapatalk_get_board_stats",
    "Get board-wide statistics: total threads, posts, members, and online visitors.",
    {},
    readOnly,
    async () => {
      try {
        const stats = await client.getBoardStat();
        return jsonResponse({ stats });
      } catch (e) {
        return jsonError(`Failed to get board stats: ${(e as Error).message}`);
      }
    },
  );
}
