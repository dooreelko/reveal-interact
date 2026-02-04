import express from "express";
import { Pool } from "pg";
import { architectureBinding } from "@arinoto/cdk-arch";
import { reactionStore, Reaction } from "@revint/arch";
import { DockerApiServer } from "../docker-api-server";

const PORT = parseInt(process.env.PORT || "3014");
const STORE_NAME = "reaction";

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

// Key type for indexed store
type ReactionKey = { id: string; sessionUid: string; page: string; uid: string };

// PostgreSQL handlers
async function store(key: ReactionKey, doc: Reaction): Promise<{ success: boolean }> {
  await pool.query(
    "INSERT INTO documents (store, key, data) VALUES ($1, $2, $3)",
    [STORE_NAME, key.id, JSON.stringify(doc)]
  );
  return { success: true };
}

async function get(key: ReactionKey): Promise<Reaction[]> {
  const result = await pool.query(
    "SELECT data FROM documents WHERE store = $1 AND key = $2 ORDER BY created_at DESC",
    [STORE_NAME, key.id]
  );
  return result.rows.map((row) => row.data as Reaction);
}

async function list(filters?: Partial<Reaction>): Promise<Reaction[]> {
  if (!filters || Object.keys(filters).length === 0) {
    const result = await pool.query(
      "SELECT data FROM documents WHERE store = $1 ORDER BY created_at DESC",
      [STORE_NAME]
    );
    return result.rows.map((row) => row.data as Reaction);
  }

  // Build WHERE clause for JSONB filtering
  const conditions = ["store = $1"];
  const params: unknown[] = [STORE_NAME];
  let paramIndex = 2;

  for (const [key, value] of Object.entries(filters)) {
    conditions.push(`data->>'${key}' = $${paramIndex}`);
    params.push(value);
    paramIndex++;
  }

  const result = await pool.query(
    `SELECT data FROM documents WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`,
    params
  );
  return result.rows.map((row) => row.data as Reaction);
}

async function main() {
  await initDb();

  architectureBinding.bind(reactionStore, {
    baseUrl: `reaction-store:${PORT}`,
    overloads: {
      store,
      get,
      list,
    },
  });

  const server = new DockerApiServer(reactionStore, {
    binding: architectureBinding,
  });
  server.start(express, PORT);
}

main().catch((err) => {
  console.error("Failed to start reaction store server:", err);
  process.exit(1);
});
