import "dotenv/config";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "src/persistence/db.js";
import { store, supply, routine } from "src/persistence/schema.js";

export function getTestDb(): Db {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set — start Postgres (docker compose up -d db) before running integration tests.");
  }
  return createDb({ DATABASE_URL: databaseUrl });
}

export async function resetDatabase(db: Db): Promise<void> {
  await db.execute(sql`TRUNCATE TABLE alert, count, inventory_movement, supply, routine, store CASCADE`);
}

export async function createTestStore(db: Db, overrides: Partial<typeof store.$inferInsert> = {}) {
  const [created] = await db
    .insert(store)
    .values({ name: "Test Store", telegramGroupId: "test-group", active: true, ...overrides })
    .returning();
  if (!created) throw new Error("Failed to create test store.");
  return created;
}

export async function createTestSupply(db: Db, storeId: string, overrides: Partial<typeof supply.$inferInsert> = {}) {
  const [created] = await db
    .insert(supply)
    .values({ storeId, category: "burger", name: "Test Supply", unit: "unidade", active: true, ...overrides })
    .returning();
  if (!created) throw new Error("Failed to create test supply.");
  return created;
}

export async function createTestRoutine(db: Db, storeId: string, overrides: Partial<typeof routine.$inferInsert> = {}) {
  const [created] = await db
    .insert(routine)
    .values({
      storeId,
      name: "Test Routine",
      verificationType: "expected_numeric",
      frequency: "daily",
      criticality: "high",
      active: true,
      ...overrides,
    })
    .returning();
  if (!created) throw new Error("Failed to create test routine.");
  return created;
}
