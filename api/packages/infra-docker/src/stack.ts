import { TerraformStack, TerraformOutput } from "cdktf";
import { Construct } from "constructs";
import { DockerProvider } from "@cdktf/provider-docker/lib/provider";
import { Image } from "@cdktf/provider-docker/lib/image";
import { Container } from "@cdktf/provider-docker/lib/container";
import { Network } from "@cdktf/provider-docker/lib/network";
import * as path from "path";

// Common PostgreSQL environment variables
const postgresEnv = [
  "POSTGRES_HOST=postgres",
  "POSTGRES_PORT=5432",
  "POSTGRES_DB=revint",
  "POSTGRES_USER=postgres",
  "POSTGRES_PASSWORD=postgres",
];

export class LocalDockerStack extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const publicKey = process.env.PUBLIC_KEY;
    if (!publicKey) {
      console.warn("Warning: PUBLIC_KEY not set. Source scripts/setup-keys.sh first.");
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
      name: `revint-app:${new Date().getTime()}`,
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

    // Session Store container
    new Container(this, "session-store-container", {
      name: "revint-session-store",
      image: appImage.imageId,
      env: ["PORT=3011", ...postgresEnv],
      networksAdvanced: [
        {
          name: appNetwork.name,
          aliases: ["session-store"],
        },
      ],
      command: ["node", "session-store-server.js"],
      mustRun: true,
    });

    // Host Store container
    new Container(this, "host-store-container", {
      name: "revint-host-store",
      image: appImage.imageId,
      env: ["PORT=3012", ...postgresEnv],
      networksAdvanced: [
        {
          name: appNetwork.name,
          aliases: ["host-store"],
        },
      ],
      command: ["node", "host-store-server.js"],
      mustRun: true,
    });

    // User Store container
    new Container(this, "user-store-container", {
      name: "revint-user-store",
      image: appImage.imageId,
      env: ["PORT=3013", ...postgresEnv],
      networksAdvanced: [
        {
          name: appNetwork.name,
          aliases: ["user-store"],
        },
      ],
      command: ["node", "user-store-server.js"],
      mustRun: true,
    });

    // Reaction Store container
    new Container(this, "reaction-store-container", {
      name: "revint-reaction-store",
      image: appImage.imageId,
      env: ["PORT=3014", ...postgresEnv],
      networksAdvanced: [
        {
          name: appNetwork.name,
          aliases: ["reaction-store"],
        },
      ],
      command: ["node", "reaction-store-server.js"],
      mustRun: true,
    });

    // API container
    const apiEnv = [
      "PORT=3000",
      "SESSION_STORE_HOST=session-store",
      "SESSION_STORE_PORT=3011",
      "HOST_STORE_HOST=host-store",
      "HOST_STORE_PORT=3012",
      "USER_STORE_HOST=user-store",
      "USER_STORE_PORT=3013",
      "REACTION_STORE_HOST=reaction-store",
      "REACTION_STORE_PORT=3014",
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
