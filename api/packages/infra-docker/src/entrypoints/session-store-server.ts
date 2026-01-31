import express from "express";
import { Pool } from "pg";
import { architectureBinding } from "@arinoto/cdk-arch";
import { sessionStoreApi, Session } from "@revint/arch";
import { DockerApiServer } from "../docker-api-server";

const PORT = parseInt(process.env.PORT || "3011");
const STORE_NAME = "session";

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

// PostgreSQL handlers
async function store(key: string, doc: Session): Promise<{ success: boolean }> {
  await pool.query(
    "INSERT INTO documents (store, key, data) VALUES ($1, $2, $3)",
    [STORE_NAME, key, JSON.stringify(doc)]
  );
  return { success: true };
}

async function get(key: string): Promise<Session[]> {
  const result = await pool.query(
    "SELECT data FROM documents WHERE store = $1 AND key = $2 ORDER BY created_at DESC",
    [STORE_NAME, key]
  );
  return result.rows.map((row) => row.data as Session);
}

async function getAll(): Promise<Session[]> {
  const result = await pool.query(
    "SELECT data FROM documents WHERE store = $1 ORDER BY created_at DESC",
    [STORE_NAME]
  );
  return result.rows.map((row) => row.data as Session);
}

async function main() {
  await initDb();

  architectureBinding.bind(sessionStoreApi, {
    baseUrl: `session-store:${PORT}`,
    overloads: {
      store,
      get,
      getAll,
    },
  });

  const server = new DockerApiServer(sessionStoreApi, {
    binding: architectureBinding,
  });
  server.start(express, PORT);
}

main().catch((err) => {
  console.error("Failed to start session store server:", err);
  process.exit(1);
});
