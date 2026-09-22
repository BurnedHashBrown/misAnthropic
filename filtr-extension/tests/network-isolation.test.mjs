import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== "tests") {
        getAllFiles(fullPath, arrayOfFiles);
      }
    } else {
      arrayOfFiles.push(fullPath);
    }
  }
  return arrayOfFiles;
}

test("Network Isolation — zero outbound network requests or external assets", () => {
  const extensionDir = "d:/GrpVetteAndRolex/filtr-extension";
  const files = getAllFiles(extensionDir);

  const forbiddenPatterns = [
    { name: "fetch API", regex: /\bfetch\s*\(/i },
    { name: "XMLHttpRequest", regex: /\bnew\s+XMLHttpRequest/i },
    { name: "WebSocket", regex: /\bnew\s+WebSocket/i },
    { name: "sendBeacon", regex: /\bnavigator\.sendBeacon/i },
    { name: "external script src", regex: /<script[^>]+src=["']https?:\/\//i },
    { name: "external stylesheet href", regex: /<link[^>]+href=["']https?:\/\//i },
    { name: "CSS @import external url", regex: /@import\s+(?:url\(['"]?)?https?:\/\//i },
  ];

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (![".js", ".html", ".css", ".json"].includes(ext)) continue;

    const content = fs.readFileSync(file, "utf8");

    for (const { name, regex } of forbiddenPatterns) {
      const match = content.match(regex);
      assert.equal(
        match,
        null,
        `File ${path.relative(extensionDir, file)} contains forbidden network pattern: ${name} (matched: ${match?.[0]})`
      );
    }
  }
});
