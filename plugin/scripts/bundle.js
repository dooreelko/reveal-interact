const esbuild = require("esbuild");
const { NodeModulesPolyfillPlugin } = require("@esbuild-plugins/node-modules-polyfill");

async function build() {
  const commonOptions = {
    entryPoints: ["src/index.ts"],
    bundle: true,
    platform: "browser",
    target: ["es2020"],
    sourcemap: true,
    external: ["reveal.js"],
    plugins: [NodeModulesPolyfillPlugin()],
  };

  // ESM bundle
  await esbuild.build({
    ...commonOptions,
    outfile: "dist/reveal-interact.esm.js",
    format: "esm",
  });

  // IIFE bundle for script tag usage
  await esbuild.build({
    ...commonOptions,
    outfile: "dist/reveal-interact.js",
    format: "iife",
    globalName: "RevealInteract",
    footer: {
      js: "RevealInteract=RevealInteract.default",
    },
  });

  console.log("Plugin build complete");
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
