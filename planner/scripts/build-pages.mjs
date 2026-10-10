// GitHub Pages 构建脚本：复制静态资源、依赖，并在发布前扫描疑似密钥。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

function copy(source, target) {
  // 缺少关键文件时立即失败，避免发布空壳或半成品。
  if (!fs.existsSync(source)) throw new Error(`缺少部署文件：${source}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}

// 每次构建从干净目录开始，避免旧文件残留到发布产物。
fs.rmSync(dist, { recursive: true, force: true });
copy(path.join(root, "index.html"), path.join(dist, "index.html"));
copy(path.join(root, ".nojekyll"), path.join(dist, ".nojekyll"));
copy(path.join(root, "web"), path.join(dist, "web"));
copy(path.join(root, "src"), path.join(dist, "src"));
copy(path.join(root, "node_modules", "zod"), path.join(dist, "node_modules", "zod"));

const forbidden = [
  // 发布产物是公开的，任何常见密钥形态都必须阻止。
  /sk-[A-Za-z0-9_-]{20,}/,
  /tvly-[A-Za-z0-9_-]{20,}/,
  /Bearer\s+[A-Za-z0-9._-]{20,}/
];
const textExtensions = new Set([".js", ".mjs", ".json", ".html", ".css", ".md", ".txt", ".yml", ".yaml"]);

function scan(directory) {
  // 只扫描文本文件，递归检查所有可被公开访问的资源。
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      scan(target);
      continue;
    }
    if (!textExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    const content = fs.readFileSync(target, "utf8");
    if (forbidden.some((pattern) => pattern.test(content))) {
      throw new Error(`部署产物中发现疑似密钥：${path.relative(root, target)}`);
    }
  }
}

scan(dist);
process.stdout.write(`Pages build ready: ${dist}\n`);
