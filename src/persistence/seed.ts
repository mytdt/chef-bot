import "dotenv/config";
import { eq } from "drizzle-orm";
import { createDb } from "src/persistence/db.js";
import { supply, store, routine } from "src/persistence/schema.js";

const STORE_NAME = "Bom Beef 0032";
const ROUTINE_NAME = "Contagem de Carne";

// PLACEHOLDER: fill in with the real telegram_group_id of the staging/production group before the E2E run.
const TELEGRAM_GROUP_ID_PLACEHOLDER = "PLACEHOLDER_TELEGRAM_GROUP_ID_FILL_IN";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }
  const db = createDb({ DATABASE_URL: databaseUrl });

  let [storeFound] = await db.select().from(store).where(eq(store.name, STORE_NAME)).limit(1);
  if (!storeFound) {
    [storeFound] = await db
      .insert(store)
      .values({ name: STORE_NAME, telegramGroupId: TELEGRAM_GROUP_ID_PLACEHOLDER, active: true })
      .returning();
    console.log(`Store created: ${storeFound?.id}`);
  } else {
    console.log(`Store already existed: ${storeFound.id}`);
  }
  if (!storeFound) {
    throw new Error("Failed to create/find store.");
  }

  const [routineFound] = await db.select().from(routine).where(eq(routine.name, ROUTINE_NAME)).limit(1);
  if (!routineFound) {
    await db.insert(routine).values({
      storeId: storeFound.id,
      name: ROUTINE_NAME,
      verificationType: "expected_numeric",
      frequency: "daily",
      criticality: "high",
      active: true,
    });
    console.log(`Routine '${ROUTINE_NAME}' created.`);
  } else {
    console.log(`Routine '${ROUTINE_NAME}' already existed.`);
  }

  // PLACEHOLDER: the real codes used in the free-text message (e.g., G, F, W from the
  // SPEC example "742 G / 689 F / 380 W") haven't been provided yet — fill in the real
  // name/unit/defaultPackageQuantity before running the real E2E flow.
  const placeholderSupplies = [
    { name: "PLACEHOLDER_SUPPLY_G", unit: "unidade", defaultPackageQuantity: null },
    { name: "PLACEHOLDER_SUPPLY_F", unit: "unidade", defaultPackageQuantity: null },
    { name: "PLACEHOLDER_SUPPLY_W", unit: "unidade", defaultPackageQuantity: null },
    // Chicken and Vegetariano: variable-quantity packages (D5) — defaultPackageQuantity
    // is null by design, not a placeholder to fill in. Names/units stay in Portuguese:
    // this is seed *data* (product info the team recognizes in bot messages), not code.
    { name: "Chicken", unit: "pacote", defaultPackageQuantity: null },
    { name: "Vegetariano", unit: "pacote", defaultPackageQuantity: null },
  ];

  for (const supplyData of placeholderSupplies) {
    const [existing] = await db.select().from(supply).where(eq(supply.name, supplyData.name)).limit(1);
    if (existing) {
      console.log(`Supply already existed: ${supplyData.name}`);
      continue;
    }
    await db.insert(supply).values({
      storeId: storeFound.id,
      category: "burger",
      name: supplyData.name,
      unit: supplyData.unit,
      defaultPackageQuantity: supplyData.defaultPackageQuantity,
      active: true,
    });
    console.log(`Supply created: ${supplyData.name}`);
  }

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((error) => {
  console.error("Failed to run seed:", error);
  process.exit(1);
});
