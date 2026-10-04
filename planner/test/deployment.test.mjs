import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("PWA manifest and service worker are present", () => {
  const manifest = JSON.parse(fs.readFileSync(new URL("../web/manifest.webmanifest", import.meta.url), "utf8"));
  const serviceWorker = fs.readFileSync(new URL("../web/sw.js", import.meta.url), "utf8");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  assert.match(serviceWorker, /CACHE_NAME/);
  assert.match(serviceWorker, /addEventListener\("fetch"/);
});

test("local server serves the web manifest with a manifest MIME type", () => {
  const server = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(server, /\.webmanifest": "application\/manifest\+json/);
});

test("GitHub Pages workflow builds and uploads the static dist directory", () => {
  const workflow = fs.readFileSync(
    new URL("../../.github/workflows/deploy-planner.yml", import.meta.url),
    "utf8"
  );
  assert.match(workflow, /npm run build --prefix planner/);
  assert.match(workflow, /enablement: true/);
  assert.match(workflow, /upload-pages-artifact/);
  assert.match(workflow, /path: planner\/dist/);
});

test("gitignore excludes keys, personal data and analysis", () => {
  const ignore = fs.readFileSync(new URL("../../.gitignore", import.meta.url), "utf8");
  assert.match(ignore, /planner\/data\//);
  assert.match(ignore, /planner\/generated\//);
  assert.match(ignore, /analysis\//);
  assert.match(ignore, /\.env/);
});
