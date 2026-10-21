// Bundles each contribution entry point into dist/ and writes the HTML page
// that Azure DevOps loads for it in an iframe.
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const entries = ["observer", "actions", "release-group"];

// azure-devops-extension-api ships only AMD modules (`define([...], factory)`),
// which esbuild can't read exports from. Rewrite each one to CommonJS with
// static requires so esbuild bundles its dependencies.
const amdToCommonJs = {
  name: "amd-to-commonjs",
  setup(build) {
    build.onLoad({ filter: /[\\/]node_modules[\\/]azure-devops-extension-api[\\/].*\.js$/ }, ({ path }) => {
      const source = readFileSync(path, "utf8");
      const match = source.match(/define\(\[([^\]]*)\]/);
      if (!match) return { contents: source, loader: "js" };
      const deps = JSON.parse(`[${match[1]}]`).map((dep) =>
        dep === "require" ? "require" : dep === "exports" ? "exports" : `require(${JSON.stringify(dep)})`,
      );
      const shim = `function define(_, factory) { factory(${deps.join(", ")}); }\n`;
      return { contents: shim + source, loader: "js" };
    });
  },
};

// The API's AMD modules require the SDK; without this, `require` would pick
// the SDK's AMD build and bundle a second, never-initialized SDK instance.
const sdkEsm = fileURLToPath(import.meta.resolve("azure-devops-extension-sdk"));
const singleSdk = {
  name: "single-sdk",
  setup(build) {
    build.onResolve({ filter: /^azure-devops-extension-sdk$/ }, () => ({ path: sdkEsm }));
  },
};

mkdirSync("dist", { recursive: true });

await build({
  entryPoints: entries.map((name) => `src/${name}.${name === "release-group" ? "tsx" : "ts"}`),
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  outdir: "dist",
  logLevel: "info",
  plugins: [amdToCommonJs, singleSdk],
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
