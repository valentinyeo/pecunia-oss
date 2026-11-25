export const isAppPath = (pathname: string): boolean =>
  pathname === "/app" || pathname.startsWith("/app/");
