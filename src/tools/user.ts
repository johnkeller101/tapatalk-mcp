import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TapatalkClient } from "../tapatalk/client.js";
import { jsonResponse, jsonError } from "../util/response.js";

export function registerUserTools(
  server: McpServer,
  client: TapatalkClient,
): void {
  const readOnly = { readOnlyHint: true };

  // ── get_user_info ──
  server.tool(
    "tapatalk_get_user_info",
    "Get a user's profile information including post count, registration date, last activity, online status, and avatar.",
    {
      username: z
        .string()
        .optional()
        .describe("Username to look up (provide either username or user_id)"),
      user_id: z
        .string()
        .optional()
        .describe("User ID to look up (provide either username or user_id)"),
    },
    readOnly,
    async ({ username, user_id }) => {
      if (!username && !user_id) {
        return jsonError("Either username or user_id is required");
      }
      try {
        const info = await client.getUserInfo({
          username,
          userId: user_id,
        });
        return jsonResponse({ user: info });
      } catch (e) {
        return jsonError(`Failed to get user info: ${(e as Error).message}`);
      }
    },
  );

  // ── get_online_users ──
  server.tool(
    "tapatalk_get_online_users",
    "List users currently online on the forum.",
    {},
    readOnly,
    async () => {
      try {
        const result = await client.getOnlineUsers();
        return jsonResponse({ online_users: result });
      } catch (e) {
        return jsonError(
          `Failed to get online users: ${(e as Error).message}`,
        );
      }
    },
  );
}
