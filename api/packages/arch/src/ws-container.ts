import { Construct } from "constructs";
import { Function, TBDFunction } from "@arinoto/cdk-arch";

export interface WsRouteEntry {
  name: string;
  path: string;
  onConnect: Function<unknown[], unknown>;
  onMessage: Function<unknown[], unknown>;
  onDisconnect: Function<unknown[], unknown>;
}

export interface WsRouteInput {
  path: string;
  handlers?: {
    onConnect?: Function<unknown[], unknown>;
    onMessage?: Function<unknown[], unknown>;
    onDisconnect?: Function<unknown[], unknown>;
  };
}

export interface WsRoutes {
  [name: string]: WsRouteInput;
}

/**
 * Container for WebSocket routes.
 * Each route has handlers for connect, message, and disconnect events.
 */
export class WsContainer extends Construct {
  private namedRoutes: Map<string, WsRouteEntry> = new Map();

  constructor(scope: Construct, id: string, routes: WsRoutes = {}) {
    super(scope, id);
    for (const [name, input] of Object.entries(routes)) {
      this.addRoute(name, input.path, input.handlers);
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
  ): WsRouteEntry {
    const entry: WsRouteEntry = {
      name,
      path,
      onConnect: handlers?.onConnect ?? new TBDFunction(this, `${name}-connect`),
      onMessage: handlers?.onMessage ?? new TBDFunction(this, `${name}-message`),
      onDisconnect: handlers?.onDisconnect ?? new TBDFunction(this, `${name}-disconnect`),
    };
    this.namedRoutes.set(name, entry);
    return entry;
  }

  getRouteByName(name: string): WsRouteEntry | undefined {
    return this.namedRoutes.get(name);
  }

  listRoutes(): WsRouteEntry[] {
    return Array.from(this.namedRoutes.values());
  }

  validateOverloads(): TBDFunction<unknown[], unknown>[] {
    const unimplemented: TBDFunction<unknown[], unknown>[] = [];
    for (const route of this.namedRoutes.values()) {
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
