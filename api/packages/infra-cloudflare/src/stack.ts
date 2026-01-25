import { TerraformStack, TerraformOutput } from "cdktf";
import { Construct } from "constructs";
import { CloudflareProvider } from "@cdktf/provider-cloudflare/lib/provider";
import { WorkersKvNamespace } from "@cdktf/provider-cloudflare/lib/workers-kv-namespace";
import { WorkersScript } from "@cdktf/provider-cloudflare/lib/workers-script";
import { WorkersScriptSubdomain } from "@cdktf/provider-cloudflare/lib/workers-script-subdomain";
import * as path from "path";
import * as fs from "fs";

export interface CloudflareStackConfig {
  accountId: string;
  workerSubdomain: string;
  publicKey: string;
}

export class CloudflareStack extends TerraformStack {
  constructor(scope: Construct, id: string, config: CloudflareStackConfig) {
    super(scope, id);

    // Configure Cloudflare provider (uses CLOUDFLARE_API_TOKEN env var)
    new CloudflareProvider(this, "cloudflare", {});

    // Create KV namespaces for each data store
    const sessionKv = new WorkersKvNamespace(this, "session-kv", {
      accountId: config.accountId,
      title: "revint-session-kv",
    });

    const hostKv = new WorkersKvNamespace(this, "host-kv", {
      accountId: config.accountId,
      title: "revint-host-kv",
    });

    const userKv = new WorkersKvNamespace(this, "user-kv", {
      accountId: config.accountId,
      title: "revint-user-kv",
    });

    const reactionKv = new WorkersKvNamespace(this, "reaction-kv", {
      accountId: config.accountId,
      title: "revint-reaction-kv",
    });

    // Read bundled worker script
    const workerPath = path.resolve(__dirname, "../dist/worker/worker.js");
    let workerContent = "";
    if (fs.existsSync(workerPath)) {
      workerContent = fs.readFileSync(workerPath, "utf-8");
      // Escape $ as $$ for Terraform (prevents interpolation)
      workerContent = workerContent.replace(/\$/g, "$$$$");
    } else {
      console.warn("Warning: Worker bundle not found. Run 'npm run build:worker' first.");
      workerContent = "export default { fetch() { return new Response('Not built'); } }";
    }

    const workerName = "revint-api";

    // Create the Workers Script
    const worker = new WorkersScript(this, "api-worker", {
      accountId: config.accountId,
      scriptName: workerName,
      content: workerContent,
      mainModule: "worker.js",
      compatibilityDate: "2024-01-01",

      // Bindings (KV namespaces and environment variables)
      bindings: [
        { type: "kv_namespace", name: "SESSION_KV", namespaceId: sessionKv.id },
        { type: "kv_namespace", name: "HOST_KV", namespaceId: hostKv.id },
        { type: "kv_namespace", name: "USER_KV", namespaceId: userKv.id },
        { type: "kv_namespace", name: "REACTION_KV", namespaceId: reactionKv.id },
        { type: "plain_text", name: "PUBLIC_KEY", text: config.publicKey },
      ],
    });

    // Enable workers.dev subdomain for the worker
    new WorkersScriptSubdomain(this, "api-worker-subdomain", {
      accountId: config.accountId,
      scriptName: workerName,
      enabled: true,
      dependsOn: [worker],
    });

    // Outputs
    new TerraformOutput(this, "worker-url", {
      value: `https://${workerName}.${config.workerSubdomain}.workers.dev`,
      description: "Worker URL",
    });

    new TerraformOutput(this, "session-kv-id", {
      value: sessionKv.id,
      description: "Session KV namespace ID",
    });

    new TerraformOutput(this, "host-kv-id", {
      value: hostKv.id,
      description: "Host KV namespace ID",
    });

    new TerraformOutput(this, "user-kv-id", {
      value: userKv.id,
      description: "User KV namespace ID",
    });

    new TerraformOutput(this, "reaction-kv-id", {
      value: reactionKv.id,
      description: "Reaction KV namespace ID",
    });
  }
}
