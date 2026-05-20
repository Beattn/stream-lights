import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Parse and safely handle DATABASE_URL with special characters
const databaseUrl = process.env.DATABASE_URL.trim();
const poolConfig = {
  connectionString: databaseUrl,
  // Additional pooling options for stability
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

// Validate URL format before creating pool
try {
  new URL(databaseUrl);
} catch {
  // If URL parsing fails, log helpful info
  console.warn("[DB] DATABASE_URL format issue detected - ensure special characters are URL encoded");
}

export const pool = new Pool(poolConfig);

// Add error handler to pool
pool.on("error", (err) => {
  console.error("[DB Pool] Unexpected error:", err);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
