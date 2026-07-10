import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

// Neon's serverless driver talks over WebSockets to support real interactive
// transactions (needed so a prompt update + its version snapshot commit atomically).
// Node lacks a global WebSocket in some runtimes, so wire one up explicitly.
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle({ client: pool, schema });
