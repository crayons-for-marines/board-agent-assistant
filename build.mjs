// Bundles each contribution entry point into dist/ and writes the HTML page
// that Azure DevOps loads for it in an iframe.
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";

const entries = ["observer", "actions", "release-group"];

mkdirSync("dist", { recursive: true });

await build({
  entryPoints: entries.map((name) => `src/${name}.${name === "release-group" ? "tsx" : "ts"}`),
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  outdir: "dist",
  logLevel: "info",
});

for (const name of entries) {
  writeFileSync(
    `dist/${name}.html`,
    `<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body><div id="root"></div><script src="${name}.js"></script></body>
</html>
`,
  );
}
