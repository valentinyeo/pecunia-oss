export interface PecuniaStackConfig {
  readonly ACCESS_AUDIENCE: string;
  readonly ACCESS_TEAM_DOMAIN: string;
  readonly EMAIL_FORWARD_TO: string;
  readonly MCP_BEARER_TOKEN: string;
  readonly PECUNIA_ORIGIN: string;
}

export const pecuniaStackConfig: PecuniaStackConfig = {
  ACCESS_AUDIENCE: "aud-example-tag",
  ACCESS_TEAM_DOMAIN: "https://example.cloudflareaccess.com",
  EMAIL_FORWARD_TO: "forward@example.test",
  MCP_BEARER_TOKEN: "mcp-bearer-example-token",
  PECUNIA_ORIGIN: "https://pecunia.example.test",
};
