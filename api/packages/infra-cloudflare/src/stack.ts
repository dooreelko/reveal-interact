import { TerraformStack, TerraformOutput } from "cdktf";
import { Construct } from "constructs";
import { CloudflareProvider } from "@cdktf/provider-cloudflare/lib/provider/index.js";
import { WorkersKvNamespace } from "@cdktf/provider-cloudflare/lib/workers-kv-namespace/index.js";
import { Worker } from "@cdktf/provider-cloudflare/lib/worker/index.js";
import { WorkerVersion } from "@cdktf/provider-cloudflare/lib/worker-version/index.js";
import { WorkersDeployment } from "@cdktf/provider-cloudflare/lib/workers-deployment/index.js";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

    const distDir = path.resolve(__dirname, "../dist/cloudflare");

    // Helper to read bundled worker content
    const readWorker = (filename: string): string => {
      const workerPath = path.join(distDir, filename);
      if (fs.existsSync(workerPath)) {
        return workerPath;
      }
      console.warn(`Warning: Worker bundle ${filename} not found. Run 'npm run build:workers' first.`);
      return "";
    };

    // --- Session Store Worker ---
    const sessionStoreWorker = new Worker(this, "session-store-worker", {
      accountId: config.accountId,
      name: "revint-session-store",
      observability: {
        enabled: true,
        logs: { enabled: true, invocationLogs: true },
      },
      subdomain: { enabled: true },
      dependsOn: [sessionKv],
    });

    const sessionStoreVersion = new WorkerVersion(this, "session-store-version", {
      accountId: config.accountId,
      workerId: sessionStoreWorker.id,
      mainModule: "index.js",
      modules: [{
        name: "index.js",
        contentFile: readWorker("session-store-worker.js"),
        contentType: "application/javascript+module",
      }],
      bindings: [{
        type: "kv_namespace",
        name: "SESSION_KV",
        namespaceId: sessionKv.id,
      }],
      compatibilityDate: "2024-09-23",
      compatibilityFlags: ["nodejs_compat"],
    });

    const sessionStoreDeployment = new WorkersDeployment(this, "session-store-deployment", {
      accountId: config.accountId,
      scriptName: sessionStoreWorker.name,
      strategy: "percentage",
      versions: [{
        versionId: sessionStoreVersion.id,
        percentage: 100,
      }],
    });

    // --- Host Store Worker ---
    const hostStoreWorker = new Worker(this, "host-store-worker", {
      accountId: config.accountId,
      name: "revint-host-store",
      observability: {
        enabled: true,
        logs: { enabled: true, invocationLogs: true },
      },
      subdomain: { enabled: true },
      dependsOn: [hostKv],
    });

    const hostStoreVersion = new WorkerVersion(this, "host-store-version", {
      accountId: config.accountId,
      workerId: hostStoreWorker.id,
      mainModule: "index.js",
      modules: [{
        name: "index.js",
        contentFile: readWorker("host-store-worker.js"),
        contentType: "application/javascript+module",
      }],
      bindings: [{
        type: "kv_namespace",
        name: "HOST_KV",
        namespaceId: hostKv.id,
      }],
      compatibilityDate: "2024-09-23",
      compatibilityFlags: ["nodejs_compat"],
    });

    const hostStoreDeployment = new WorkersDeployment(this, "host-store-deployment", {
      accountId: config.accountId,
      scriptName: hostStoreWorker.name,
      strategy: "percentage",
      versions: [{
        versionId: hostStoreVersion.id,
        percentage: 100,
      }],
    });

    // --- User Store Worker ---
    const userStoreWorker = new Worker(this, "user-store-worker", {
      accountId: config.accountId,
      name: "revint-user-store",
      observability: {
        enabled: true,
        logs: { enabled: true, invocationLogs: true },
      },
      subdomain: { enabled: true },
      dependsOn: [userKv],
    });

    const userStoreVersion = new WorkerVersion(this, "user-store-version", {
      accountId: config.accountId,
      workerId: userStoreWorker.id,
      mainModule: "index.js",
      modules: [{
        name: "index.js",
        contentFile: readWorker("user-store-worker.js"),
        contentType: "application/javascript+module",
      }],
      bindings: [{
        type: "kv_namespace",
        name: "USER_KV",
        namespaceId: userKv.id,
      }],
      compatibilityDate: "2024-09-23",
      compatibilityFlags: ["nodejs_compat"],
    });

    const userStoreDeployment = new WorkersDeployment(this, "user-store-deployment", {
      accountId: config.accountId,
      scriptName: userStoreWorker.name,
      strategy: "percentage",
      versions: [{
        versionId: userStoreVersion.id,
        percentage: 100,
      }],
    });

    // --- Reaction Store Worker ---
    const reactionStoreWorker = new Worker(this, "reaction-store-worker", {
      accountId: config.accountId,
      name: "revint-reaction-store",
      observability: {
        enabled: true,
        logs: { enabled: true, invocationLogs: true },
      },
      subdomain: { enabled: true },
      dependsOn: [reactionKv],
    });

    const reactionStoreVersion = new WorkerVersion(this, "reaction-store-version", {
      accountId: config.accountId,
      workerId: reactionStoreWorker.id,
      mainModule: "index.js",
      modules: [{
        name: "index.js",
        contentFile: readWorker("reaction-store-worker.js"),
        contentType: "application/javascript+module",
      }],
      bindings: [{
        type: "kv_namespace",
        name: "REACTION_KV",
        namespaceId: reactionKv.id,
      }],
      compatibilityDate: "2024-09-23",
      compatibilityFlags: ["nodejs_compat"],
    });

    const reactionStoreDeployment = new WorkersDeployment(this, "reaction-store-deployment", {
      accountId: config.accountId,
      scriptName: reactionStoreWorker.name,
      strategy: "percentage",
      versions: [{
        versionId: reactionStoreVersion.id,
        percentage: 100,
      }],
    });

    // --- API Worker ---
    const apiWorker = new Worker(this, "api-worker", {
      accountId: config.accountId,
      name: "revint-api",
      observability: {
        enabled: true,
        logs: { enabled: true, headSamplingRate: 1, invocationLogs: true },
      },
      subdomain: { enabled: true },
      dependsOn: [sessionStoreWorker, hostStoreWorker, userStoreWorker, reactionStoreWorker],
    });

    const apiVersion = new WorkerVersion(this, "api-version", {
      accountId: config.accountId,
      workerId: apiWorker.id,
      mainModule: "index.js",
      modules: [{
        name: "index.js",
        contentFile: readWorker("api-worker.js"),
        contentType: "application/javascript+module",
      }],
      bindings: [
        { type: "service", name: "SESSION_STORE", service: sessionStoreWorker.name },
        { type: "service", name: "HOST_STORE", service: hostStoreWorker.name },
        { type: "service", name: "USER_STORE", service: userStoreWorker.name },
        { type: "service", name: "REACTION_STORE", service: reactionStoreWorker.name },
        { type: "plain_text", name: "PUBLIC_KEY", text: config.publicKey },
      ],
      compatibilityDate: "2024-09-23",
      compatibilityFlags: ["nodejs_compat"],
      dependsOn: [sessionStoreDeployment, hostStoreDeployment, userStoreDeployment, reactionStoreDeployment],
    });

    new WorkersDeployment(this, "api-deployment", {
      accountId: config.accountId,
      scriptName: apiWorker.name,
      strategy: "percentage",
      versions: [{
        versionId: apiVersion.id,
        percentage: 100,
      }],
    });

    // Outputs
    new TerraformOutput(this, "worker-url", {
      value: `https://revint-api.${config.workerSubdomain}.workers.dev`,
      description: "API Worker URL",
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
