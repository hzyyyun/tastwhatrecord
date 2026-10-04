import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync(new URL("../web/styles.css", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../web/index.html", import.meta.url), "utf8");

test("Chatbox dialog is constrained to the viewport", () => {
  assert.match(css, /#chatbox-dialog\s*\{[^}]*max-width:\s*90vw/s);
  assert.match(css, /#chatbox-dialog\s*\{[^}]*max-height:\s*90vh/s);
  assert.match(css, /#chatbox-dialog \.chatbox-card\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto/s);
});

test("Chatbox dialog uses an internal scroll region and fixed action row", () => {
  assert.match(css, /\.dialog-scroll-area\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.dialog-scroll-area\s*\{[^}]*overflow-x:\s*hidden/s);
  const start = html.indexOf('<dialog id="chatbox-dialog">');
  const end = html.indexOf("</dialog>", start);
  const chatboxDialog = html.slice(start, end);
  assert.ok(chatboxDialog.indexOf('class="dialog-scroll-area"') < chatboxDialog.indexOf('class="dialog-actions"'));
});

test("Chatbox dialog has mobile viewport rules", () => {
  assert.match(css, /#chatbox-dialog\s*\{[^}]*calc\(100vw - 16px\)/s);
  assert.match(css, /#chatbox-dialog \.chatbox-card\s*\{[^}]*calc\(100dvh - 16px\)/s);
});
