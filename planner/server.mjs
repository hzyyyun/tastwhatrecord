// 本地静态服务器：只绑定回环地址，提供 PWA 资源并阻止目录穿越。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
// 优先使用环境变量指定端口，方便本机已有服务占位时切换。
const preferredPort = Number(process.env.PLANNER_PORT || 4173);

// 只登记前端实际使用的类型；未知类型按二进制下发。
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
  // 将 URL 路径映射到项目目录内，任何越界路径都返回 null 并由调用方拒绝。
  const pathname = decodeURIComponent(urlPath.split("?")[0]);
  const relative = pathname === "/" ? "/web/index.html" : pathname;
  const target = path.resolve(root, `.${relative}`);
  if (!target.startsWith(root + path.sep)) return null;
  return target;
}

function createServer() {
  // 根路径和 /web 都跳转到带尾斜杠的静态入口。
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
      // 目录请求自动寻找 index.html，支持直接访问 /web/。
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
  // 端口被占用时尝试下一个端口，最多十次，避免启动直接失败。
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
