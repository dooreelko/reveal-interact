import { TerraformStack, TerraformOutput } from "cdktf";
import { Construct } from "constructs";
import { DockerProvider } from "@cdktf/provider-docker/lib/provider";
import { Image } from "@cdktf/provider-docker/lib/image";
import { Container } from "@cdktf/provider-docker/lib/container";
import { Network } from "@cdktf/provider-docker/lib/network";
import * as path from "path";
import * as fs from "fs";

function loadPublicKey(): string | undefined {
  // Try loading from .env file first
  const envFile = path.resolve(__dirname, "../.env");
  if (fs.existsSync(envFile)) {
    const content = fs.readFileSync(envFile, "utf-8");
    const match = content.match(/PUBLIC_KEY="([^"]+)"/);
    if (match) {
      // Convert pipe-delimited back to newlines
      return match[1].replace(/\|/g, "\n");
    }
  }
  // Fall back to environment variable
  return process.env.PUBLIC_KEY;
}

export class LocalDockerStack extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const publicKey = loadPublicKey();
    if (!publicKey) {
      console.warn("Warning: PUBLIC_KEY not found. Run scripts/create-session.sh first.");
    }

    // Configure Docker provider (supports podman)
    new DockerProvider(this, "docker", {
      host: process.env.DOCKER_HOST || `unix://${process.env.XDG_RUNTIME_DIR}/podman/podman.sock`,
    });

    // Create network for service communication
    const appNetwork = new Network(this, "app-network", {
      name: "revint-network",
    });

    // Build the app image from bundled dist/docker directory
    const bundleDir = path.resolve(__dirname, "../dist/docker");
    const dockerFile = path.join(bundleDir, "Dockerfile");
    const appImage = new Image(this, "app-image", {
      name: "revint-app:latest",
      buildAttribute: {
        context: bundleDir,
        dockerfile: dockerFile,
      },
    });

    // PostgreSQL image
    const postgresImage = new Image(this, "postgres-image", {
      name: "postgres:16-alpine",
      keepLocally: true,
    });

    // PostgreSQL container
    new Container(this, "postgres-container", {
      name: "revint-postgres",
      image: postgresImage.imageId,
      env: [
        "POSTGRES_USER=postgres",
        "POSTGRES_PASSWORD=postgres",
        "POSTGRES_DB=revint",
      ],
      networksAdvanced: [
        {
          name: appNetwork.name,
          aliases: ["postgres"],
        },
      ],
      healthcheck: {
        test: ["CMD-SHELL", "pg_isready -U postgres"],
        interval: "5s",
        timeout: "5s",
        retries: 5,
      },
      mustRun: true,
    });

    // Datastore container
    new Container(this, "datastore-container", {
      name: "revint-datastore",
      image: appImage.imageId,
      env: [
        "PORT=3001",
        "POSTGRES_HOST=postgres",
        "POSTGRES_PORT=5432",
        "POSTGRES_DB=revint",
        "POSTGRES_USER=postgres",
        "POSTGRES_PASSWORD=postgres",
      ],
      networksAdvanced: [
        {
          name: appNetwork.name,
          aliases: ["datastore"],
        },
      ],
      command: ["node", "datastore-server.js"],
      mustRun: true,
    });

    // API container
    const apiEnv = [
      "PORT=3000",
      "DATASTORE_HOST=datastore",
      "DATASTORE_PORT=3001",
    ];
    if (publicKey) {
      apiEnv.push(`PUBLIC_KEY=${publicKey}`);
    }

    new Container(this, "api-container", {
      name: "revint-api",
      image: appImage.imageId,
      ports: [
        {
          internal: 3000,
          external: 3000,
        },
      ],
      env: apiEnv,
      networksAdvanced: [
        {
          name: appNetwork.name,
          aliases: ["api"],
        },
      ],
      command: ["node", "api-server.js"],
      mustRun: true,
    });

    // WebSocket container
    new Container(this, "ws-container", {
      name: "revint-ws",
      image: appImage.imageId,
      ports: [
        {
          internal: 3002,
          external: 3002,
        },
      ],
      env: ["PORT=3002"],
      networksAdvanced: [
        {
          name: appNetwork.name,
          aliases: ["ws"],
        },
      ],
      command: ["node", "ws-server.js"],
      mustRun: true,
    });

    // Outputs
    new TerraformOutput(this, "api-endpoint", {
      value: "http://localhost:3000",
      description: "API endpoint",
    });

    new TerraformOutput(this, "ws-endpoint", {
      value: "ws://localhost:3002",
      description: "WebSocket endpoint",
    });

    new TerraformOutput(this, "example-new-session", {
      value: "curl -X POST http://localhost:3000/api/v1/session/new/test-token",
      description: "Example: Create new session",
    });

    new TerraformOutput(this, "example-get-state", {
      value: "curl http://localhost:3000/api/v1/session/{token}/state",
      description: "Example: Get session state",
    });
  }
}
