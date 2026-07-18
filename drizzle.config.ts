import { defineConfig } from "drizzle-kit";
import "dotenv/config";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL não definida — configure o .env antes de rodar drizzle-kit.");
}

export default defineConfig({
  schema: "./src/persistencia/schema.ts",
  out: "./src/persistencia/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
