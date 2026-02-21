import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TapatalkClient } from "../tapatalk/client.js";
import { jsonResponse, jsonError } from "../util/response.js";

export function registerWriteTools(
  server: McpServer,
  client: TapatalkClient,
): void {
  const destructive = { readOnlyHint: false, destructiveHint: true };

  // ── new_topic ──
  server.tool(
    "tapatalk_new_topic",
    "Create a new topic in a forum. THIS WILL POST PUBLICLY to the forum. Requires authentication and write mode (TAPATALK_READ_ONLY=false).",
    {
      forum_id: z.string().describe("Forum ID to post the new topic in"),
      subject: z
        .string()
        .min(1)
        .describe("Topic subject/title"),
      body: z
        .string()
        .min(1)
        .describe("Topic body content (BBCode formatting supported)"),
    },
    destructive,
    async ({ forum_id, subject, body }) => {
      if (!client.isLoggedIn()) {
        return jsonError(
          "Not logged in. Configure TAPATALK_USERNAME and TAPATALK_PASSWORD.",
        );
      }
      try {
        const result = await client.newTopic(forum_id, subject, body);
        if (result.result) {
          return jsonResponse({
            success: true,
            topic_id: result.topic_id,
            message: "Topic created successfully",
          });
        }
        return jsonError(
          `Failed to create topic: ${result.result_text ?? "Unknown error"}`,
        );
      } catch (e) {
        return jsonError(`Failed to create topic: ${(e as Error).message}`);
      }
    },
  );

  // ── reply_post ──
  server.tool(
    "tapatalk_reply_post",
    "Reply to an existing topic. THIS WILL POST PUBLICLY to the forum. Requires authentication and write mode (TAPATALK_READ_ONLY=false).",
    {
      forum_id: z.string().describe("Forum ID containing the topic"),
      topic_id: z.string().describe("Topic ID to reply to"),
      subject: z
        .string()
        .optional()
        .default("")
        .describe("Reply subject (usually left empty to inherit topic subject)"),
      body: z
        .string()
        .min(1)
        .describe("Reply body content (BBCode formatting supported)"),
    },
    destructive,
    async ({ forum_id, topic_id, subject, body }) => {
      if (!client.isLoggedIn()) {
        return jsonError(
          "Not logged in. Configure TAPATALK_USERNAME and TAPATALK_PASSWORD.",
        );
      }
      try {
        const result = await client.replyPost(forum_id, topic_id, subject, body);
        if (result.result) {
          return jsonResponse({
            success: true,
            post_id: result.post_id,
            message: "Reply posted successfully",
          });
        }
        return jsonError(
          `Failed to post reply: ${result.result_text ?? "Unknown error"}`,
        );
      } catch (e) {
        return jsonError(`Failed to post reply: ${(e as Error).message}`);
      }
    },
  );
}
