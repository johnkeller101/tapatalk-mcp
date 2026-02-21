# Tapatalk MCP Server

An MCP (Model Context Protocol) server that connects AI assistants to any [Tapatalk](https://www.tapatalk.com/)-enabled forum. This covers thousands of phpBB, vBulletin, XenForo, MyBB, and SMF forums that have the Tapatalk plugin installed.

Built specifically for use with Claude Code, but compatible with any MCP client.

## What It Does

- Browse forum structure and list topics
- Read full thread content with posts, authors, and timestamps
- Search topics and posts by keyword, user, forum, or date range
- View user profiles and online status
- Optionally create topics and post replies (disabled by default)

## Requirements

- Node.js 18+
- A Tapatalk-enabled forum (the forum must have the Tapatalk/mobiquo plugin installed)

## Installation

```bash
# Clone the repo
git clone <repo-url> tapatalk-mcp
cd tapatalk-mcp

# Install dependencies
npm install

# Build
npm run build
```

## Configuration

All configuration is through environment variables.

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `TAPATALK_FORUM_URL` | Base URL of the forum (no trailing slash) | `https://forums.example.com` |

### Optional — Authentication

| Variable | Description | Default |
|----------|-------------|---------|
| `TAPATALK_USERNAME` | Forum username for authenticated access | _(none — guest mode)_ |
| `TAPATALK_PASSWORD` | Forum password | _(none — guest mode)_ |

When credentials are provided, the server logs in once on startup and automatically re-authenticates if the session expires. No background requests are made — re-login only happens when you actually use a tool and the session has gone stale.

Without credentials, the server operates in guest mode with access to public forums only.

### Optional — Cloudflare Bypass

| Variable | Description | Default |
|----------|-------------|---------|
| `TAPATALK_CHROME_CDP_URL` | URL of a headless Chrome instance for Cloudflare-protected forums | _(none — direct requests)_ |

Some forums use Cloudflare which blocks server-side requests. When configured, the server first tries a direct request. If it gets a 403, it automatically connects to the headless Chrome instance via CDP, navigates to the forum to establish Cloudflare clearance, then executes XML-RPC calls from within the browser context using the browser's real TLS fingerprint. The browser page is cached for 10 minutes and automatically reconnects when stale.

Example: `TAPATALK_CHROME_CDP_URL=http://chrome:9222` (when running alongside a `chromedp/headless-shell` container).

### Optional — Safety

| Variable | Description | Default |
|----------|-------------|---------|
| `TAPATALK_READ_ONLY` | When `true`, write tools are not registered at all | `true` |
| `TAPATALK_ALLOW_HTTP` | Must be `true` to allow non-HTTPS forum URLs | `false` |

**Read-only mode is on by default.** The write tools (`tapatalk_new_topic`, `tapatalk_reply_post`) are not even available to the AI unless you explicitly set `TAPATALK_READ_ONLY=false`.

HTTPS is enforced by default. If your forum only supports HTTP, you must explicitly opt in with `TAPATALK_ALLOW_HTTP=true`. Be aware this transmits credentials in plaintext.

## Adding to Claude Code

Add the server to your Claude Code MCP configuration:

### Read-only (recommended for getting started)

```json
{
  "mcpServers": {
    "tapatalk": {
      "command": "node",
      "args": ["/path/to/tapatalk-mcp/dist/index.js"],
      "env": {
        "TAPATALK_FORUM_URL": "https://forums.example.com"
      }
    }
  }
}
```

### With authentication (read-only)

```json
{
  "mcpServers": {
    "tapatalk": {
      "command": "node",
      "args": ["/path/to/tapatalk-mcp/dist/index.js"],
      "env": {
        "TAPATALK_FORUM_URL": "https://forums.example.com",
        "TAPATALK_USERNAME": "your_username",
        "TAPATALK_PASSWORD": "your_password"
      }
    }
  }
}
```

This gives you access to private forums and features like unread topics, while keeping write operations disabled.

### With Cloudflare bypass (headless Chrome)

```json
{
  "mcpServers": {
    "tapatalk": {
      "command": "node",
      "args": ["/path/to/tapatalk-mcp/dist/index.js"],
      "env": {
        "TAPATALK_FORUM_URL": "https://forums.example.com",
        "TAPATALK_CHROME_CDP_URL": "http://localhost:9222"
      }
    }
  }
}
```

Requires a headless Chrome instance running with remote debugging enabled (e.g. `chromedp/headless-shell:stable`).

### With write access

```json
{
  "mcpServers": {
    "tapatalk": {
      "command": "node",
      "args": ["/path/to/tapatalk-mcp/dist/index.js"],
      "env": {
        "TAPATALK_FORUM_URL": "https://forums.example.com",
        "TAPATALK_USERNAME": "your_username",
        "TAPATALK_PASSWORD": "your_password",
        "TAPATALK_READ_ONLY": "false"
      }
    }
  }
}
```

## Available Tools

### Forum Browsing

| Tool | Description |
|------|-------------|
| `tapatalk_get_config` | Get forum capabilities and Tapatalk version. Good for verifying connectivity. |
| `tapatalk_get_forum` | List all forums/subforums in a tree structure. Returns forum IDs needed for other tools. |
| `tapatalk_get_board_stats` | Total threads, posts, members, and online visitors. |

### Topic Listing

| Tool | Description |
|------|-------------|
| `tapatalk_get_topics` | List topics in a specific forum. Supports pagination and filtering by stickies/announcements. |
| `tapatalk_get_latest_topics` | Latest topics across all forums, ordered by date. |
| `tapatalk_get_unread_topics` | Unread topics for the logged-in user. Requires authentication. |
| `tapatalk_get_participated_topics` | Topics you've posted in. Requires authentication. |

### Reading Threads

| Tool | Description |
|------|-------------|
| `tapatalk_get_thread` | Read posts in a topic. Returns post content, authors, timestamps, attachments. Paginated. |
| `tapatalk_get_thread_by_unread` | Jump to the first unread post in a topic. Requires authentication. |

### Search

| Tool | Description |
|------|-------------|
| `tapatalk_search_topics` | Search topics by keyword. Returns topic matches with short content previews. |
| `tapatalk_search_posts` | Search individual posts by keyword. Returns post-level matches. |
| `tapatalk_search_advanced` | Advanced search with filters: keywords, user, forum, date range, title-only mode. |

### User Info

| Tool | Description |
|------|-------------|
| `tapatalk_get_user_info` | Get a user's profile by username or user ID. |
| `tapatalk_get_online_users` | List currently online users. |

### Write Operations (requires `TAPATALK_READ_ONLY=false`)

| Tool | Description |
|------|-------------|
| `tapatalk_new_topic` | Create a new topic in a forum. Posts publicly to the forum. |
| `tapatalk_reply_post` | Reply to an existing topic. Posts publicly to the forum. |

## Usage Examples

Once configured, you can interact with the forum through Claude naturally:

- "What forums are available?"
- "Show me the latest topics in the General Discussion forum"
- "Search for posts about 'firmware update'"
- "Read the thread about the new release"
- "Find all posts by user 'johndoe' in the last month"
- "What's the total post count on this forum?"

## Pagination

All list/search tools support pagination with `page` (1-based) and `per_page` (default 20, max 50) parameters. Responses include a `meta` object with:

```json
{
  "meta": {
    "total": 142,
    "page": 1,
    "per_page": 20,
    "has_more": true
  }
}
```

Search results also include a `search_id` that can be passed back for efficient pagination through cached server-side results.

## How It Works

The server communicates with the forum through Tapatalk's XML-RPC API, which is exposed at `/mobiquo/mobiquo.php` on any forum with the Tapatalk plugin installed. The MCP server:

1. Translates MCP tool calls into XML-RPC method calls
2. Handles Tapatalk's `byte[]` (base64-encoded string) parameter convention
3. Manages session cookies for authentication
4. Parses XML-RPC responses back into structured JSON

### Checking if a forum supports Tapatalk

Visit `https://your-forum.com/mobiquo/mobiquo.php` in a browser. If you see a response (even an error page from the mobiquo script), Tapatalk is installed. If you get a 404, it's not.

## Security

### Credentials
- Credentials are only accepted via environment variables, never CLI arguments
- Passwords are never logged or included in tool responses
- HTTPS is enforced by default

### Read-Only Default
- Write tools are **not registered** in read-only mode (the default) — they cannot be invoked at all
- Write mode requires explicit opt-in via `TAPATALK_READ_ONLY=false`

### Network
- All requests go to a single fixed URL (the configured forum)
- No redirects to other hosts are followed (SSRF prevention)
- Response size is capped at 5MB
- Request timeout is 15 seconds

### Content Safety
- Forum content (posts, titles, usernames) is returned as structured JSON data fields
- No forum content is executed, interpreted, or used to construct API calls
- All tool inputs are validated via Zod schemas before any API call is made

### XML-RPC
- Custom hand-written XML parser — no XXE vulnerability surface
- All string inputs are XML-escaped before embedding in requests
- Strict parsing that rejects malformed responses

## Compatibility

This server works with any forum that has the Tapatalk plugin installed, including:

- **phpBB** 3.x
- **vBulletin** 4.x / 5.x
- **XenForo** 1.x / 2.x
- **MyBB** 1.8+
- **SMF** 2.x
- **Kunena** (Joomla)
- **WoltLab** (WBB)

The Tapatalk API is standardized across all these platforms — the same MCP tools work regardless of the underlying forum software.

## Development

```bash
# Watch mode (recompile on changes)
npm run dev

# Build once
npm run build

# Run directly
TAPATALK_FORUM_URL=https://your-forum.com node dist/index.js
```

## License

MIT
