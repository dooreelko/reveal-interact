import { App } from "cdktf";
import { CloudflareStack } from "./stack";

function loadConfig(): { accountId: string; workerSubdomain: string; publicKey: string } {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const workerSubdomain = process.env.CLOUDFLARE_WORKERS_SUBDOMAIN;
  const publicKey = process.env.PUBLIC_KEY;

  if (!accountId) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID environment variable is required");
  }

  if (!workerSubdomain) {
    throw new Error("CLOUDFLARE_WORKERS_SUBDOMAIN environment variable is required");
  }

  if (!publicKey) {
    throw new Error("PUBLIC_KEY environment variable is required");
  }

  return { accountId, workerSubdomain, publicKey };
}

const app = new App();
const config = loadConfig();

new CloudflareStack(app, "cloudflare", {
  accountId: config.accountId,
  workerSubdomain: config.workerSubdomain,
  publicKey: config.publicKey,
});

app.synth();
