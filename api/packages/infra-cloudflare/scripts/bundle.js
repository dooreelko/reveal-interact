const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const distWorker = path.join(__dirname, "..", "dist", "worker");

// Ensure output directory exists
fs.mkdirSync(distWorker, { recursive: true });

async function bundle() {
  console.log("Bundling worker...");
  await esbuild.build({
    // Bundle directly from TypeScript source for proper ESM output
    entryPoints: [path.join(__dirname, "..", "src", "workers", "main.ts")],
    bundle: true,
    format: "esm",
    target: "esnext",
    outfile: path.join(distWorker, "worker.js"),
    minify: false,
    sourcemap: false,
    // Cloudflare Workers environment
    platform: "browser",
    mainFields: ["module", "main"],
    conditions: ["worker", "browser", "import", "default"],
  });

  console.log("Bundle complete!");
}

bundle().catch((err) => {
  console.error("Bundle failed:", err);
  process.exit(1);
});
