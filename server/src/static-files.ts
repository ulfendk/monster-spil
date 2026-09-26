import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

/**
 * Serves the built game (client/dist) from the game server itself, so one Docker image
 * is the whole game: the page, and the server it talks to at the same address. Only GET
 * and HEAD; never anything outside the folder. Hashed files under /assets/ are cached for
 * good; the page, the service worker and the manifest are always checked afresh, so an
 * update reaches the iPads the next time they open the game.
 */

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".txt": "text/plain; charset=utf-8",
};

/** Always fetched fresh: they decide which version of the game a device runs. */
const NEVER_CACHE = new Set(["/", "/index.html", "/sw.js", "/registerSW.js", "/manifest.webmanifest"]);

export function createStaticHandler(root: string): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  const base = path.resolve(root);
  return async (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") return false;
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    } catch {
      return false;
    }
    if (pathname.includes("\0")) return false;
    let file = path.resolve(base, "." + path.posix.normalize(pathname));
    // Never outside the game's folder.
    if (file !== base && !file.startsWith(base + path.sep)) return false;
    let info = await stat(file).catch(() => undefined);
    if (info?.isDirectory()) {
      file = path.join(file, "index.html");
      info = await stat(file).catch(() => undefined);
    }
    if (!info?.isFile()) {
      // A path without a file ending is a page of the app: the app itself answers it.
      if (path.extname(pathname)) return false;
      file = path.join(base, "index.html");
      info = await stat(file).catch(() => undefined);
      if (!info?.isFile()) return false;
      pathname = "/index.html";
    }
    const cache = NEVER_CACHE.has(pathname) || file.endsWith("index.html")
      ? "no-cache"
      : pathname.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "public, max-age=3600";
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": info.size,
      "Cache-Control": cache,
      "X-Content-Type-Options": "nosniff",
    });
    if (req.method === "HEAD") res.end();
    else createReadStream(file).pipe(res);
    return true;
  };
}
