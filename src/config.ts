export interface Config {
  forumUrl: string;
  mobiquoUrl: string;
  username?: string;
  password?: string;
  readOnly: boolean;
  timeoutMs: number;
  maxResponseSize: number;
  flareSolverrUrl?: string;
}

export function loadConfig(): Config {
  const forumUrl = process.env.TAPATALK_FORUM_URL;
  if (!forumUrl) {
    throw new Error("TAPATALK_FORUM_URL environment variable is required");
  }

  const normalized = forumUrl.replace(/\/+$/, "");

  try {
    new URL(normalized);
  } catch {
    throw new Error(`TAPATALK_FORUM_URL is not a valid URL: ${normalized}`);
  }

  if (normalized.startsWith("http://")) {
    const allowHttp = process.env.TAPATALK_ALLOW_HTTP === "true";
    if (!allowHttp) {
      throw new Error(
        "TAPATALK_FORUM_URL uses HTTP which transmits credentials in plaintext. " +
        "Use HTTPS, or set TAPATALK_ALLOW_HTTP=true to override.",
      );
    }
    process.stderr.write(
      "[WARN] TAPATALK_FORUM_URL uses HTTP. Credentials will be transmitted in plaintext.\n",
    );
  }

  const readOnlyEnv = process.env.TAPATALK_READ_ONLY;
  const readOnly = readOnlyEnv === undefined || readOnlyEnv !== "false";

  const flareSolverrUrl = process.env.TAPATALK_FLARESOLVERR_URL;
  if (flareSolverrUrl) {
    try {
      new URL(flareSolverrUrl);
    } catch {
      throw new Error(`TAPATALK_FLARESOLVERR_URL is not a valid URL: ${flareSolverrUrl}`);
    }
  }

  return {
    forumUrl: normalized,
    mobiquoUrl: `${normalized}/mobiquo/mobiquo.php`,
    username: process.env.TAPATALK_USERNAME,
    password: process.env.TAPATALK_PASSWORD,
    readOnly,
    timeoutMs: 15000,
    maxResponseSize: 5 * 1024 * 1024, // 5MB
    flareSolverrUrl: flareSolverrUrl?.replace(/\/+$/, ""),
  };
}
