import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "src/persistencia/schema.js";
import type { Env } from "src/config/env.js";

export function criarDb(env: Pick<Env, "DATABASE_URL">) {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  return drizzle(pool, { schema });
}

export type Db = ReturnType<typeof criarDb>;
