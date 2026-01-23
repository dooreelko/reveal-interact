import { ApiContainer, architectureBinding, ArchitectureBinding } from "@arinoto/cdk-arch";
import type { Application, Request, Response } from "express";

export interface DockerApiServerConfig {
  binding?: ArchitectureBinding;
}

/**
 * Creates an Express server from an ApiContainer's route definitions.
 */
export class DockerApiServer {
  private api: ApiContainer;
  private binding: ArchitectureBinding;

  constructor(api: ApiContainer, config?: DockerApiServerConfig) {
    this.api = api;
    this.binding = config?.binding ?? architectureBinding;
  }

  createApp(express: typeof import("express")): Application {
    const app = express();
    app.use(express.json());

    for (const route of this.api.listNamedRoutes()) {
      this.setupRoute(app, route.name, route.path, route.handler);
    }

    return app;
  }

  private setupRoute(
    app: Application,
    name: string,
    routePath: string,
    handler: { invoke: (...args: unknown[]) => Promise<unknown> }
  ): void {
    const { method, path, paramNames } = this.parseRoute(routePath);

    const expressHandler = async (req: Request, res: Response) => {
      try {
        const args = paramNames.map((p) => req.params[p]);
        if (req.body && Object.keys(req.body).length > 0) {
          args.push(req.body);
        }
        const result = await handler.invoke(...args);
        res.json(result);
      } catch (error) {
        console.error(`Error handling ${name}:`, error);
        res.status(500).json({ error: String(error) });
      }
    };

    switch (method.toUpperCase()) {
      case "GET":
        app.get(path, expressHandler);
        break;
      case "POST":
        app.post(path, expressHandler);
        break;
      case "PUT":
        app.put(path, expressHandler);
        break;
      case "DELETE":
        app.delete(path, expressHandler);
        break;
      default:
        app.all(path, expressHandler);
    }
  }

  private parseRoute(routePath: string): {
    method: string;
    path: string;
    paramNames: string[];
  } {
    const [method, ...pathParts] = routePath.split(" ");
    const rawPath = pathParts.join(" ");
    const paramNames: string[] = [];

    const path = rawPath.replace(/\{(\w+)\}/g, (_, name) => {
      paramNames.push(name);
      return `:${name}`;
    });

    return { method, path, paramNames };
  }

  listen(app: Application, port: number): void {
    app.listen(port, () => {
      console.log(`Server listening on port ${port}`);
    });
  }

  start(express: typeof import("express"), port: number): void {
    const app = this.createApp(express);
    this.listen(app, port);
  }
}
