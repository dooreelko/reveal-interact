import { WebSocketServer, WebSocket } from "ws";
import { createServer, IncomingMessage } from "http";
import { URL } from "url";
import {
  ws,
  hostPipe,
  userPipe,
  StateChangeMessage,
} from "@revint/arch";

const PORT = parseInt(process.env.PORT || "3002");

interface Connection {
  ws: WebSocket;
  type: "host" | "user";
  token: string;
  uid: string;
}

// Connection registry by session
const connections = new Map<string, Connection[]>();

function addConnection(conn: Connection): void {
  const existing = connections.get(conn.token) || [];
  existing.push(conn);
  connections.set(conn.token, existing);
}

function removeConnection(conn: Connection): void {
  const existing = connections.get(conn.token) || [];
  const filtered = existing.filter((c) => c.ws !== conn.ws);
  if (filtered.length > 0) {
    connections.set(conn.token, filtered);
  } else {
    connections.delete(conn.token);
  }
}

function broadcastToSession(token: string, message: StateChangeMessage): void {
  const conns = connections.get(token) || [];
  const data = JSON.stringify(message);
  for (const conn of conns) {
    if (conn.type === "user" && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(data);
    }
  }
}

// Implement WebSocket handlers - using type assertions for generic Function types
hostPipe.onConnect.overload((async (...args: unknown[]) => {
  const [token, uid] = args as [string, string];
  console.log(`Host connected: token=${token}, uid=${uid}`);
  return { success: true };
}) as never);

hostPipe.onMessage.overload((async (...args: unknown[]) => {
  const [token, uid, data] = args as [string, string, unknown];
  console.log(`Host message: token=${token}, uid=${uid}`, data);
  // Host can broadcast state changes
  if (typeof data === "object" && data !== null && "type" in data) {
    const msg = data as StateChangeMessage;
    if (msg.type === "state_change") {
      broadcastToSession(token, msg);
    }
  }
  return { success: true };
}) as never);

hostPipe.onDisconnect.overload((async (...args: unknown[]) => {
  const [token, uid] = args as [string, string];
  console.log(`Host disconnected: token=${token}, uid=${uid}`);
  return { success: true };
}) as never);

userPipe.onConnect.overload((async (...args: unknown[]) => {
  const [token, uid] = args as [string, string];
  console.log(`User connected: token=${token}, uid=${uid}`);
  return { success: true };
}) as never);

userPipe.onMessage.overload((async (...args: unknown[]) => {
  const [token, uid, data] = args as [string, string, unknown];
  console.log(`User message: token=${token}, uid=${uid}`, data);
  return { success: true };
}) as never);

userPipe.onDisconnect.overload((async (...args: unknown[]) => {
  const [token, uid] = args as [string, string];
  console.log(`User disconnected: token=${token}, uid=${uid}`);
  return { success: true };
}) as never);

// Parse WebSocket path
function parsePath(
  pathname: string
): { type: "host" | "user"; token: string; uid: string } | null {
  // /ws/v1/session/{token}/host/{uid}/pipe
  // /ws/v1/session/{token}/user/{uid}/pipe
  const hostMatch = pathname.match(
    /^\/ws\/v1\/session\/([^/]+)\/host\/([^/]+)\/pipe$/
  );
  if (hostMatch) {
    return { type: "host", token: hostMatch[1], uid: hostMatch[2] };
  }

  const userMatch = pathname.match(
    /^\/ws\/v1\/session\/([^/]+)\/user\/([^/]+)\/pipe$/
  );
  if (userMatch) {
    return { type: "user", token: userMatch[1], uid: userMatch[2] };
  }

  return null;
}

// Create HTTP server for WebSocket upgrade
const server = createServer((req, res) => {
  res.writeHead(200);
  res.end("WebSocket server");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (socket: WebSocket, req: IncomingMessage) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const parsed = parsePath(url.pathname);

  if (!parsed) {
    socket.close(4000, "Invalid path");
    return;
  }

  const { type, token, uid } = parsed;

  const conn: Connection = { ws: socket, type, token, uid };
  addConnection(conn);

  // Call connect handler
  const pipe = type === "host" ? hostPipe : userPipe;
  pipe.onConnect.invoke(token, uid).catch(console.error);

  socket.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());
      pipe.onMessage.invoke(token, uid, message).catch(console.error);
    } catch (err) {
      console.error("Failed to parse message:", err);
    }
  });

  socket.on("close", () => {
    removeConnection(conn);
    pipe.onDisconnect.invoke(token, uid).catch(console.error);
  });

  socket.on("error", (err) => {
    console.error("WebSocket error:", err);
    removeConnection(conn);
  });
});

server.listen(PORT, () => {
  console.log(`WebSocket server listening on port ${PORT}`);
});

// Export broadcast function for use by API server
export { broadcastToSession };
