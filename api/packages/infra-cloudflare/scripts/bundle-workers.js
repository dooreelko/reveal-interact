import esbuild from "esbuild";
import commonjsPlugin from "@chialab/esbuild-plugin-commonjs";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const workers = [
  { entry: "src/entrypoints/api-worker.ts", out: "api-worker.js" },
  { entry: "src/entrypoints/session-store-worker.ts", out: "session-store-worker.js" },
  { entry: "src/entrypoints/host-store-worker.ts", out: "host-store-worker.js" },
  { entry: "src/entrypoints/user-store-worker.ts", out: "user-store-worker.js" },
  { entry: "src/entrypoints/reaction-store-worker.ts", out: "reaction-store-worker.js" },
];

const outdir = path.resolve(__dirname, "../dist/cloudflare");

// Ensure output directory exists
fs.mkdirSync(outdir, { recursive: true });

async function bundle() {
  console.log("Bundling workers...");

  for (const worker of workers) {
    await esbuild.build({
      entryPoints: [path.resolve(__dirname, "..", worker.entry)],
      bundle: true,
      outfile: path.join(outdir, worker.out),
      format: "esm",
      platform: "browser",
      target: "esnext",
      minify: false,
      sourcemap: false,
      mainFields: ["module", "main"],
      conditions: ["worker", "browser", "import", "default"],
      // External crypto - will be provided by nodejs_compat
      external: ["crypto"],
      plugins: [commonjsPlugin()],
    });
    console.log(`Bundled ${worker.entry} -> dist/cloudflare/${worker.out}`);
  }

  console.log("Bundle complete!");
}

bundle().catch((err) => {
  console.error("Bundle failed:", err);
  process.exit(1);
});
