import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const preferredPort = Number(process.env.PLANNER_PORT || 4173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

function safePath(urlPath) {
  const pathname = decodeURIComponent(urlPath.split("?")[0]);
  const relative = pathname === "/" ? "/web/index.html" : pathname;
  const target = path.resolve(root, `.${relative}`);
  if (!target.startsWith(root + path.sep)) return null;
  return target;
}

function createServer() {
  return http.createServer((request, response) => {
    const pathname = decodeURIComponent((request.url || "/").split("?")[0]);
    if (pathname === "/" || pathname === "/web") {
      response.writeHead(302, {
        location: "/web/",
        "cache-control": "no-store"
      });
      response.end();
      return;
    }

    let target = safePath(request.url || "/");
    if (!target) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
      target = path.join(target, "index.html");
    }
    if (!fs.existsSync(target)) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "content-type": mimeTypes[path.extname(target).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store"
    });
    fs.createReadStream(target).pipe(response);
  });
}

function listen(port, attemptsLeft = 10) {
  const server = createServer();
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && attemptsLeft > 0) {
      listen(port + 1, attemptsLeft - 1);
      return;
    }
    throw error;
  });
  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(`Student Planner OS: http://127.0.0.1:${port}/web/\n`);
    process.stdout.write("关闭此窗口即可停止本地服务。\n");
  });
}

listen(preferredPort);
