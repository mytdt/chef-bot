import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL não definida.");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  await migrate(db, { migrationsFolder: "./src/persistencia/migrations" });
  console.log("Migrations aplicadas com sucesso.");

  await pool.end();
}

main().catch((error) => {
  console.error("Falha ao aplicar migrations:", error);
  process.exit(1);
});
