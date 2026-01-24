import express from "express";
import { Pool } from "pg";
import { architectureBinding } from "@arinoto/cdk-arch";
import {
  arch,
  datastoreApi,
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
          key TEXT NOT NULL,
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

// Bind stores with PostgreSQL overloads
async function main() {
  await initDb();

  // Bind the datastore API locally with PostgreSQL implementations
  architectureBinding.bind(datastoreApi, {
    host: "datastore",
    port: PORT,
    overloads: {
      "session-store": createPostgresStore<Session>("session"),
      "session-get": createPostgresGet<Session>("session"),
      "session-getAll": createPostgresGetAll<Session>("session"),

      "host-store": createPostgresStore<Host>("host"),
      "host-get": createPostgresGet<Host>("host"),
      "host-getAll": createPostgresGetAll<Host>("host"),

      "user-store": createPostgresStore<User>("user"),
      "user-get": createPostgresGet<User>("user"),
      "user-getAll": createPostgresGetAll<User>("user"),

      "reaction-store": createPostgresStore<Reaction>("reaction"),
      "reaction-get": createPostgresGet<Reaction>("reaction"),
      "reaction-getAll": createPostgresGetAll<Reaction>("reaction"),
    },
  });

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
