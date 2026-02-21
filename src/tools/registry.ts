import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TapatalkClient } from "../tapatalk/client.js";
import { registerForumTools } from "./forum.js";
import { registerTopicTools } from "./topic.js";
import { registerThreadTools } from "./thread.js";
import { registerSearchTools } from "./search.js";
import { registerUserTools } from "./user.js";
import { registerWriteTools } from "./write.js";
import { logger } from "../util/logger.js";

export function registerAllTools(
  server: McpServer,
  client: TapatalkClient,
  readOnly: boolean,
): void {
  // Read tools — always registered
  registerForumTools(server, client);
  registerTopicTools(server, client);
  registerThreadTools(server, client);
  registerSearchTools(server, client);
  registerUserTools(server, client);

  // Write tools — only registered if read-only mode is disabled
  if (!readOnly) {
    registerWriteTools(server, client);
    logger.info("Write tools enabled (TAPATALK_READ_ONLY=false)");
  } else {
    logger.info("Write tools disabled (read-only mode)");
  }
}
