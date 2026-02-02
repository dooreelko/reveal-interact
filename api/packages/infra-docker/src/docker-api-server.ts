import { ApiContainer, ApiRoutes, architectureBinding, ArchitectureBinding } from "@arinoto/cdk-arch";
import type { Application, Request, Response } from "express";
import { RequestContext, CookieOptions, EnvConfig } from "@revint/arch";

export interface DockerApiServerConfig {
  binding?: ArchitectureBinding;
}

/**
 * Creates an Express server from an ApiContainer's route definitions.
 */
export class DockerApiServer<TRoutes extends ApiRoutes = ApiRoutes> {
  private api: ApiContainer<TRoutes>;
  private binding: ArchitectureBinding;

  constructor(api: ApiContainer<TRoutes>, config?: DockerApiServerConfig) {
    this.api = api;
    this.binding = config?.binding ?? architectureBinding;
  }

  createApp(express: typeof import("express")): Application {
    const app = express();
    app.use(express.json());

    for (const name of this.api.listRoutes()) {
      const route = this.api.getRoute(name);
      this.setupRoute(app, name, route.path, route.handler);
    }

    return app;
  }

  private parseCookies(cookieHeader: string | undefined): Record<string, string | undefined> {
    const cookies: Record<string, string | undefined> = {};
    if (!cookieHeader) return cookies;

    cookieHeader.split(";").forEach((cookie) => {
      const [name, ...rest] = cookie.trim().split("=");
      if (name) {
        cookies[name] = rest.join("=");
      }
    });

    return cookies;
  }

  private createContext(req: Request, res: Response): RequestContext {
    const cookies = this.parseCookies(req.headers.cookie);

    return {
      headers: req.headers as Record<string, string | undefined>,
      cookies,
      ip: req.ip,
      env: process.env as EnvConfig,
      setCookie: (name: string, value: string, options?: CookieOptions) => {
        const cookieParts = [`${name}=${value}`];

        if (options?.maxAge !== undefined) {
          cookieParts.push(`Max-Age=${options.maxAge}`);
        }
        if (options?.httpOnly) {
          cookieParts.push("HttpOnly");
        }
        if (options?.secure) {
          cookieParts.push("Secure");
        }
        if (options?.sameSite) {
          cookieParts.push(`SameSite=${options.sameSite}`);
        }
        // Default path to "/" so cookies are sent with all requests
        cookieParts.push(`Path=${options?.path ?? "/"}`);

        res.append("Set-Cookie", cookieParts.join("; "));
      },
    };
  }

  private setupRoute(
    app: Application,
    name: string,
    routePath: string,
    handler: { invokeWithRuntimeContext: (args: unknown[], ctx: unknown) => Promise<unknown> }
  ): void {
    const { method, path, paramNames } = this.parseRoute(routePath);

    const expressHandler = async (req: Request, res: Response) => {
      try {
        const args: unknown[] = paramNames.map((p) => req.params[p]);
        if (req.body && Object.keys(req.body).length > 0) {
          args.push(req.body);
        }

        // Pass RequestContext via runtime context (bound to `this` in handler)
        const ctx = this.createContext(req, res);
        const result = await handler.invokeWithRuntimeContext(args, ctx);
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
