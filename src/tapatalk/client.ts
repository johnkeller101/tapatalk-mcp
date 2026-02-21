/**
 * Tapatalk API client — typed methods wrapping XML-RPC calls.
 *
 * Handles auto-login on startup and lazy re-login on session expiry.
 * All byte[] (base64) param encoding is handled here per-method.
 */

import { XmlRpcClient, XmlRpcFault } from "../xmlrpc/client.js";
import type { ParamType } from "../xmlrpc/serialize.js";
import { logger } from "../util/logger.js";
import type {
  TapatalkConfig,
  TapatalkForum,
  TapatalkTopicList,
  TapatalkThread,
  TapatalkSearchResult,
  TapatalkUserInfo,
  TapatalkBoardStat,
  TapatalkLoginResult,
  TapatalkNewTopicResult,
  TapatalkReplyResult,
} from "./types.js";

export class TapatalkClient {
  private rpc: XmlRpcClient;
  private username?: string;
  private password?: string;
  private loggedIn = false;

  constructor(
    rpc: XmlRpcClient,
    username?: string,
    password?: string,
  ) {
    this.rpc = rpc;
    this.username = username;
    this.password = password;
  }

  /** Call an XML-RPC method with automatic re-login on session expiry. */
  private async callWithRetry(
    method: string,
    params: unknown[] = [],
    paramTypes?: ParamType[],
  ): Promise<unknown> {
    try {
      return await this.rpc.call(method, params, paramTypes);
    } catch (err) {
      // If we were logged in and got an auth-related error, try re-login once
      if (this.loggedIn && this.username && this.password && this.isAuthError(err)) {
        logger.info("Session expired, re-logging in...");
        this.rpc.clearCookies();
        this.loggedIn = false;
        await this.login();
        return await this.rpc.call(method, params, paramTypes);
      }
      throw err;
    }
  }

  private isAuthError(err: unknown): boolean {
    if (err instanceof XmlRpcFault) {
      // Common phpBB/Tapatalk auth error codes
      const msg = err.faultString.toLowerCase();
      return (
        msg.includes("not logged in") ||
        msg.includes("session") ||
        msg.includes("permission") ||
        msg.includes("login") ||
        err.faultCode === 4 // common auth fault code
      );
    }
    return false;
  }

  // ── Authentication ──

  async login(): Promise<TapatalkLoginResult> {
    if (!this.username || !this.password) {
      throw new Error("No credentials configured");
    }
    logger.info("Logging in...");
    const result = (await this.rpc.call(
      "login",
      [this.username, this.password],
      ["base64", "base64"],
    )) as TapatalkLoginResult;

    if (result.result) {
      this.loggedIn = true;
      logger.info("Login successful");
    } else {
      const msg = result.result_text ?? "Unknown error";
      logger.error(`Login failed: ${msg}`);
      throw new Error(`Login failed: ${msg}`);
    }
    return result;
  }

  isLoggedIn(): boolean {
    return this.loggedIn;
  }

  hasCredentials(): boolean {
    return !!(this.username && this.password);
  }

  // ── Forum Methods ──

  async getConfig(): Promise<TapatalkConfig> {
    return (await this.rpc.call("get_config")) as TapatalkConfig;
  }

  async getForum(
    returnDescription = false,
    forumId?: string,
  ): Promise<TapatalkForum[]> {
    const params: unknown[] = [returnDescription];
    const types: ParamType[] = ["boolean"];
    if (forumId !== undefined) {
      params.push(forumId);
      types.push("string");
    }
    const result = await this.callWithRetry("get_forum", params, types);
    // get_forum returns an array directly (or a struct with a child array)
    if (Array.isArray(result)) return result as TapatalkForum[];
    const obj = result as Record<string, unknown>;
    if (Array.isArray(obj.child)) return obj.child as TapatalkForum[];
    // Some implementations wrap in a struct
    return [result as TapatalkForum];
  }

  async getBoardStat(): Promise<TapatalkBoardStat> {
    return (await this.callWithRetry("get_board_stat")) as TapatalkBoardStat;
  }

  // ── Topic Methods ──

  async getTopics(
    forumId: string,
    startNum = 0,
    lastNum = 19,
    mode?: string,
  ): Promise<TapatalkTopicList> {
    const params: unknown[] = [forumId, startNum, lastNum];
    const types: ParamType[] = ["string", "int", "int"];
    if (mode) {
      params.push(mode);
      types.push("string");
    }
    return (await this.callWithRetry(
      "get_topic",
      params,
      types,
    )) as TapatalkTopicList;
  }

  async getLatestTopics(
    startNum = 0,
    lastNum = 19,
  ): Promise<TapatalkTopicList> {
    return (await this.callWithRetry(
      "get_latest_topic",
      [startNum, lastNum],
      ["int", "int"],
    )) as TapatalkTopicList;
  }

  async getUnreadTopics(
    startNum = 0,
    lastNum = 19,
  ): Promise<TapatalkTopicList> {
    return (await this.callWithRetry(
      "get_unread_topic",
      [startNum, lastNum],
      ["int", "int"],
    )) as TapatalkTopicList;
  }

  async getParticipatedTopics(
    startNum = 0,
    lastNum = 19,
  ): Promise<TapatalkTopicList> {
    return (await this.callWithRetry(
      "get_participated_topic",
      [startNum, lastNum],
      ["int", "int"],
    )) as TapatalkTopicList;
  }

  // ── Thread/Post Methods ──

  async getThread(
    topicId: string,
    startNum = 0,
    lastNum = 19,
    returnHtml = true,
  ): Promise<TapatalkThread> {
    return (await this.callWithRetry(
      "get_thread",
      [topicId, startNum, lastNum, returnHtml],
      ["string", "int", "int", "boolean"],
    )) as TapatalkThread;
  }

  async getThreadByUnread(topicId: string): Promise<TapatalkThread> {
    return (await this.callWithRetry(
      "get_thread_by_unread",
      [topicId],
      ["string"],
    )) as TapatalkThread;
  }

  // ── Search Methods ──

  async searchTopics(
    query: string,
    startNum = 0,
    lastNum = 19,
    searchId?: string,
  ): Promise<TapatalkSearchResult> {
    if (searchId) {
      return (await this.callWithRetry(
        "search_topic",
        [query, startNum, lastNum, searchId],
        ["base64", "int", "int", "string"],
      )) as TapatalkSearchResult;
    }
    return (await this.callWithRetry(
      "search_topic",
      [query, startNum, lastNum],
      ["base64", "int", "int"],
    )) as TapatalkSearchResult;
  }

  async searchPosts(
    query: string,
    startNum = 0,
    lastNum = 19,
    searchId?: string,
  ): Promise<TapatalkSearchResult> {
    if (searchId) {
      return (await this.callWithRetry(
        "search_post",
        [query, startNum, lastNum, searchId],
        ["base64", "int", "int", "string"],
      )) as TapatalkSearchResult;
    }
    return (await this.callWithRetry(
      "search_post",
      [query, startNum, lastNum],
      ["base64", "int", "int"],
    )) as TapatalkSearchResult;
  }

  async searchAdvanced(opts: {
    keywords?: string;
    userId?: string;
    searchUser?: string;
    forumId?: string;
    threadId?: string;
    titleOnly?: boolean;
    showPosts?: boolean;
    searchTime?: number;
    page?: number;
    perPage?: number;
    searchId?: string;
  }): Promise<TapatalkSearchResult> {
    // The advanced search uses a struct/named params approach
    // But the XML-RPC method actually takes positional params
    const params: unknown[] = [];
    const types: ParamType[] = [];

    // searchid
    params.push(opts.searchId ?? "");
    types.push("string");
    // page
    params.push(opts.page ?? 1);
    types.push("int");
    // perpage
    params.push(opts.perPage ?? 20);
    types.push("int");
    // keywords
    params.push(opts.keywords ?? "");
    types.push("base64");
    // userid
    params.push(opts.userId ?? "");
    types.push("string");
    // searchuser
    params.push(opts.searchUser ?? "");
    types.push("base64");
    // forumid
    params.push(opts.forumId ?? "");
    types.push("string");
    // threadid
    params.push(opts.threadId ?? "");
    types.push("string");
    // titleonly
    params.push(opts.titleOnly ? 1 : 0);
    types.push("int");
    // showposts
    params.push(opts.showPosts ? 1 : 0);
    types.push("int");
    // searchtime
    params.push(opts.searchTime ?? 0);
    types.push("int");

    return (await this.callWithRetry(
      "search",
      params,
      types,
    )) as TapatalkSearchResult;
  }

  // ── User Methods ──

  async getUserInfo(opts: {
    username?: string;
    userId?: string;
  }): Promise<TapatalkUserInfo> {
    if (opts.userId) {
      // When passing user_id, first param is empty username
      return (await this.callWithRetry(
        "get_user_info",
        ["", opts.userId],
        ["base64", "string"],
      )) as TapatalkUserInfo;
    }
    if (opts.username) {
      return (await this.callWithRetry(
        "get_user_info",
        [opts.username],
        ["base64"],
      )) as TapatalkUserInfo;
    }
    throw new Error("Either username or userId is required");
  }

  async getOnlineUsers(): Promise<unknown> {
    return await this.callWithRetry("get_online_users");
  }

  // ── Write Methods ──

  async newTopic(
    forumId: string,
    subject: string,
    body: string,
  ): Promise<TapatalkNewTopicResult> {
    if (!this.loggedIn) {
      throw new Error("Must be logged in to create topics");
    }
    return (await this.callWithRetry(
      "new_topic",
      [forumId, subject, body],
      ["string", "base64", "base64"],
    )) as TapatalkNewTopicResult;
  }

  async replyPost(
    forumId: string,
    topicId: string,
    subject: string,
    body: string,
  ): Promise<TapatalkReplyResult> {
    if (!this.loggedIn) {
      throw new Error("Must be logged in to reply to posts");
    }
    return (await this.callWithRetry(
      "reply_post",
      [forumId, topicId, subject, body],
      ["string", "string", "base64", "base64"],
    )) as TapatalkReplyResult;
  }
}
