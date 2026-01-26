const esbuild = require("esbuild");

async function build() {
  // ESM bundle
  await esbuild.build({
    entryPoints: ["src/index.ts"],
    outfile: "dist/revint-lib.esm.js",
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["es2020"],
    sourcemap: true,
  });

  // IIFE bundle for script tag usage
  await esbuild.build({
    entryPoints: ["src/index.ts"],
    outfile: "dist/revint-lib.js",
    bundle: true,
    format: "iife",
    globalName: "RevintLib",
    platform: "browser",
    target: ["es2020"],
    sourcemap: true,
  });

  console.log("Build complete");
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
