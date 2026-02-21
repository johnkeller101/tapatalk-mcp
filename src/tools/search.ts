import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TapatalkClient } from "../tapatalk/client.js";
import { jsonResponse, jsonError } from "../util/response.js";

export function registerSearchTools(
  server: McpServer,
  client: TapatalkClient,
): void {
  const readOnly = { readOnlyHint: true, idempotentHint: true };

  // ── search_topics ──
  server.tool(
    "tapatalk_search_topics",
    "Search for topics by keyword. Returns matching topics with titles, authors, and short content previews.",
    {
      query: z.string().min(3).describe("Search query (minimum 3 characters)"),
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
        .describe("Results per page (max 50)"),
      search_id: z
        .string()
        .optional()
        .describe(
          "Search ID from a previous search result, for paginating through cached results",
        ),
    },
    readOnly,
    async ({ query, page, per_page, search_id }) => {
      try {
        const startNum = (page - 1) * per_page;
        const lastNum = startNum + per_page - 1;
        const result = await client.searchTopics(
          query,
          startNum,
          lastNum,
          search_id,
        );
        const topics = result.topics ?? [];
        const total = result.total_topic_num ?? topics.length;
        return jsonResponse(
          { topics },
          {
            total,
            page,
            per_page,
            has_more: page * per_page < total,
            search_id: result.search_id,
          },
        );
      } catch (e) {
        return jsonError(`Search failed: ${(e as Error).message}`);
      }
    },
  );

  // ── search_posts ──
  server.tool(
    "tapatalk_search_posts",
    "Search for individual posts by keyword. Returns matching posts with content previews and their parent topic info.",
    {
      query: z.string().min(3).describe("Search query (minimum 3 characters)"),
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
        .describe("Results per page (max 50)"),
      search_id: z
        .string()
        .optional()
        .describe(
          "Search ID from a previous search result, for paginating through cached results",
        ),
    },
    readOnly,
    async ({ query, page, per_page, search_id }) => {
      try {
        const startNum = (page - 1) * per_page;
        const lastNum = startNum + per_page - 1;
        const result = await client.searchPosts(
          query,
          startNum,
          lastNum,
          search_id,
        );
        const posts = result.posts ?? [];
        const total = result.total_post_num ?? posts.length;
        return jsonResponse(
          { posts },
          {
            total,
            page,
            per_page,
            has_more: page * per_page < total,
            search_id: result.search_id,
          },
        );
      } catch (e) {
        return jsonError(`Search failed: ${(e as Error).message}`);
      }
    },
  );

  // ── search (advanced) ──
  server.tool(
    "tapatalk_search_advanced",
    "Advanced search with multiple filters: keywords, user, forum, date range, title-only. More powerful than basic search.",
    {
      keywords: z
        .string()
        .optional()
        .describe("Search keywords"),
      user_id: z
        .string()
        .optional()
        .describe("Filter by user ID"),
      search_user: z
        .string()
        .optional()
        .describe("Filter by username"),
      forum_id: z
        .string()
        .optional()
        .describe("Restrict search to this forum ID"),
      thread_id: z
        .string()
        .optional()
        .describe("Restrict search to this thread/topic ID"),
      title_only: z
        .boolean()
        .optional()
        .default(false)
        .describe("Search only in topic titles"),
      show_posts: z
        .boolean()
        .optional()
        .default(false)
        .describe("Return individual posts instead of topics"),
      search_time: z
        .number()
        .int()
        .optional()
        .describe("Time window in seconds (e.g. 86400 for last 24 hours)"),
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
        .describe("Results per page (max 50)"),
      search_id: z
        .string()
        .optional()
        .describe("Search ID for paginating previous results"),
    },
    readOnly,
    async (args) => {
      try {
        const result = await client.searchAdvanced({
          keywords: args.keywords,
          userId: args.user_id,
          searchUser: args.search_user,
          forumId: args.forum_id,
          threadId: args.thread_id,
          titleOnly: args.title_only,
          showPosts: args.show_posts,
          searchTime: args.search_time,
          page: args.page,
          perPage: args.per_page,
          searchId: args.search_id,
        });

        if (args.show_posts) {
          const posts = result.posts ?? [];
          const total = result.total_post_num ?? posts.length;
          return jsonResponse(
            { posts },
            {
              total,
              page: args.page,
              per_page: args.per_page,
              has_more: (args.page ?? 1) * (args.per_page ?? 20) < total,
              search_id: result.search_id,
            },
          );
        }

        const topics = result.topics ?? [];
        const total = result.total_topic_num ?? topics.length;
        return jsonResponse(
          { topics },
          {
            total,
            page: args.page,
            per_page: args.per_page,
            has_more: (args.page ?? 1) * (args.per_page ?? 20) < total,
            search_id: result.search_id,
          },
        );
      } catch (e) {
        return jsonError(`Advanced search failed: ${(e as Error).message}`);
      }
    },
  );
}
