import express from "express";
import { Pool } from "pg";
import { architectureBinding, ApiContainer } from "@arinoto/cdk-arch";
import {
  sessionStore,
  hostStore,
  userStore,
  reactionStore,
  Session,
  Host,
  User,
  Reaction,
} from "@revint/arch";
import { DockerApiServer } from "../docker-api-server";

const PORT = parseInt(process.env.PORT || "3001");

// PostgreSQL connection
const pool = new Pool({
  host: process.env.POSTGRES_HOST || "postgres",
  port: parseInt(process.env.POSTGRES_PORT || "5432"),
  database: process.env.POSTGRES_DB || "revint",
  user: process.env.POSTGRES_USER || "postgres",
  password: process.env.POSTGRES_PASSWORD || "postgres",
});

// Initialize database
async function initDb(): Promise<void> {
  const maxRetries = 30;
  for (let i = 0; i < maxRetries; i++) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS documents (
          id SERIAL PRIMARY KEY,
          store VARCHAR(255) NOT NULL,
          key VARCHAR(255) NOT NULL,
          data JSONB NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_documents_store_key ON documents(store, key)
      `);
      console.log("Database initialized");
      return;
    } catch (error) {
      console.log(`Waiting for database... (${i + 1}/${maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error("Failed to connect to database");
}

// Create PostgreSQL handlers for a store
function createPostgresStore<TDoc>(storeName: string) {
  return async (key: string, doc: TDoc): Promise<{ success: boolean }> => {
    await pool.query(
      "INSERT INTO documents (store, key, data) VALUES ($1, $2, $3)",
      [storeName, key, JSON.stringify(doc)]
    );
    return { success: true };
  };
}

function createPostgresGet<TDoc>(storeName: string) {
  return async (key: string): Promise<TDoc[]> => {
    const result = await pool.query(
      "SELECT data FROM documents WHERE store = $1 AND key = $2 ORDER BY created_at DESC",
      [storeName, key]
    );
    return result.rows.map((row) => row.data as TDoc);
  };
}

function createPostgresGetAll<TDoc>(storeName: string) {
  return async (): Promise<TDoc[]> => {
    const result = await pool.query(
      "SELECT data FROM documents WHERE store = $1 ORDER BY created_at DESC",
      [storeName]
    );
    return result.rows.map((row) => row.data as TDoc);
  };
}

// Create a combined API container for all data stores
const datastoreApi = new ApiContainer(
  { node: { id: "datastore-api" } } as never,
  "datastore-api"
);

// Add routes for each store
datastoreApi.addRoute("session-store", "POST /store/session/{key}", sessionStore.storeFunction);
datastoreApi.addRoute("session-get", "GET /store/session/{key}", sessionStore.getFunction);
datastoreApi.addRoute("session-getAll", "GET /store/session", sessionStore.getAllFunction);

datastoreApi.addRoute("host-store", "POST /store/host/{key}", hostStore.storeFunction);
datastoreApi.addRoute("host-get", "GET /store/host/{key}", hostStore.getFunction);
datastoreApi.addRoute("host-getAll", "GET /store/host", hostStore.getAllFunction);

datastoreApi.addRoute("user-store", "POST /store/user/{key}", userStore.storeFunction);
datastoreApi.addRoute("user-get", "GET /store/user/{key}", userStore.getFunction);
datastoreApi.addRoute("user-getAll", "GET /store/user", userStore.getAllFunction);

datastoreApi.addRoute("reaction-store", "POST /store/reaction/{key}", reactionStore.storeFunction);
datastoreApi.addRoute("reaction-get", "GET /store/reaction/{key}", reactionStore.getFunction);
datastoreApi.addRoute("reaction-getAll", "GET /store/reaction", reactionStore.getAllFunction);

// Bind stores with PostgreSQL overloads
async function main() {
  await initDb();

  // Overload each store with PostgreSQL handlers
  sessionStore.storeFunction.overload(createPostgresStore<Session>("session"));
  sessionStore.getFunction.overload(createPostgresGet<Session>("session"));
  sessionStore.getAllFunction.overload(createPostgresGetAll<Session>("session"));

  hostStore.storeFunction.overload(createPostgresStore<Host>("host"));
  hostStore.getFunction.overload(createPostgresGet<Host>("host"));
  hostStore.getAllFunction.overload(createPostgresGetAll<Host>("host"));

  userStore.storeFunction.overload(createPostgresStore<User>("user"));
  userStore.getFunction.overload(createPostgresGet<User>("user"));
  userStore.getAllFunction.overload(createPostgresGetAll<User>("user"));

  reactionStore.storeFunction.overload(createPostgresStore<Reaction>("reaction"));
  reactionStore.getFunction.overload(createPostgresGet<Reaction>("reaction"));
  reactionStore.getAllFunction.overload(createPostgresGetAll<Reaction>("reaction"));

  // Bind the datastore API locally
  architectureBinding.bind(datastoreApi, { host: "datastore", port: PORT });

  // Start server
  const server = new DockerApiServer(datastoreApi, {
    binding: architectureBinding,
  });
  server.start(express, PORT);
}

main().catch((err) => {
  console.error("Failed to start datastore server:", err);
  process.exit(1);
});
