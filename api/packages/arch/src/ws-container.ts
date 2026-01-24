import { Construct } from "constructs";
import { Function, TBDFunction } from "@arinoto/cdk-arch";

export interface WsRouteEntry {
  path: string;
  onConnect: Function<unknown[], unknown>;
  onMessage: Function<unknown[], unknown>;
  onDisconnect: Function<unknown[], unknown>;
}

export interface WsRouteInput {
  path: string;
  onConnect?: Function<unknown[], unknown>;
  onMessage?: Function<unknown[], unknown>;
  onDisconnect?: Function<unknown[], unknown>;
}

export interface WsRoutes {
  [name: string]: WsRouteEntry;
}

export interface WsRoutesInput {
  [name: string]: WsRouteInput;
}

/**
 * Container for WebSocket routes.
 * Each route has handlers for connect, message, and disconnect events.
 */
export class WsContainer extends Construct {
  public readonly routes: WsRoutes;

  constructor(scope: Construct, id: string, routes: WsRoutesInput = {}) {
    super(scope, id);
    this.routes = {};
    for (const [name, input] of Object.entries(routes)) {
      this.routes[name] = {
        path: input.path,
        onConnect: input.onConnect ?? new TBDFunction(this, `${name}-connect`),
        onMessage: input.onMessage ?? new TBDFunction(this, `${name}-message`),
        onDisconnect: input.onDisconnect ?? new TBDFunction(this, `${name}-disconnect`),
      };
    }
  }

  addRoute(
    name: string,
    path: string,
    handlers?: {
      onConnect?: Function<unknown[], unknown>;
      onMessage?: Function<unknown[], unknown>;
      onDisconnect?: Function<unknown[], unknown>;
    }
  ): void {
    this.routes[name] = {
      path,
      onConnect: handlers?.onConnect ?? new TBDFunction(this, `${name}-connect`),
      onMessage: handlers?.onMessage ?? new TBDFunction(this, `${name}-message`),
      onDisconnect: handlers?.onDisconnect ?? new TBDFunction(this, `${name}-disconnect`),
    };
  }

  getRoute(name: string): WsRouteEntry {
    const entry = this.routes[name];
    if (!entry) {
      throw new Error(`Route '${name}' not found in container '${this.node.id}'`);
    }
    return entry;
  }

  listRoutes(): string[] {
    return Object.keys(this.routes);
  }

  validateOverloads(): TBDFunction<unknown[], unknown>[] {
    const unimplemented: TBDFunction<unknown[], unknown>[] = [];
    for (const route of Object.values(this.routes)) {
      if (route.onConnect instanceof TBDFunction && !route.onConnect.hasOverload()) {
        unimplemented.push(route.onConnect);
      }
      if (route.onMessage instanceof TBDFunction && !route.onMessage.hasOverload()) {
        unimplemented.push(route.onMessage);
      }
      if (route.onDisconnect instanceof TBDFunction && !route.onDisconnect.hasOverload()) {
        unimplemented.push(route.onDisconnect);
      }
    }
    return unimplemented;
  }
}
