const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const distDocker = path.join(__dirname, "..", "dist", "docker");

// Ensure output directory exists
fs.mkdirSync(distDocker, { recursive: true });

// Bundle entrypoints
const entrypoints = [
  "api-server",
  "session-store-server",
  "host-store-server",
  "user-store-server",
  "reaction-store-server",
  "ws-server",
];

async function bundle() {
  for (const entry of entrypoints) {
    console.log(`Bundling ${entry}...`);
    await esbuild.build({
      entryPoints: [path.join(__dirname, "..", "dist", "entrypoints", `${entry}.js`)],
      bundle: true,
      platform: "node",
      target: "node20",
      outfile: path.join(distDocker, `${entry}.js`),
      external: ["pg-native"],
    });
  }

  // Copy Dockerfile
  fs.copyFileSync(
    path.join(__dirname, "..", "src", "Dockerfile"),
    path.join(distDocker, "Dockerfile")
  );

  // Create minimal package.json for container
  const pkg = {
    name: "revint-docker",
    version: "0.0.1",
    dependencies: {
      pg: "^8.11.0",
    },
  };
  fs.writeFileSync(
    path.join(distDocker, "package.json"),
    JSON.stringify(pkg, null, 2)
  );

  console.log("Bundle complete!");
}

bundle().catch((err) => {
  console.error("Bundle failed:", err);
  process.exit(1);
});
