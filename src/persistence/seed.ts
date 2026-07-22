import "dotenv/config";
import { eq } from "drizzle-orm";
import { createDb } from "src/persistence/db.js";
import { supply, store, routine } from "src/persistence/schema.js";

const STORE_NAME = "Bom Beef 0032";
const ROUTINE_NAME = "Contagem de Carne";

// Real staging group id, confirmed by Emanoel (2026-07-21).
const TELEGRAM_GROUP_ID = "5107923619";

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
      .values({ name: STORE_NAME, telegramGroupId: TELEGRAM_GROUP_ID, active: true })
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

  // Real names confirmed by Emanoel (2026-07-19 and 2026-07-21), cross-checked against
  // the PRODUCT_MAP in bbb-protein-consumption (companion tool, same team, reused with
  // permission). F/G/W/CHICKEN/CHORI/VEGETARIANO are the exact codes collaborators type
  // in free-text counts.
  const realSupplies = [
    { code: "F", name: "Burger de 90g", unit: "unidade", defaultPackageQuantity: null },
    { code: "G", name: "Burger de 160g", unit: "unidade", defaultPackageQuantity: null },
    { code: "W", name: "Burger de Wagyu de 200g", unit: "unidade", defaultPackageQuantity: null },
    // Assumed fixed-quantity like F/G/W (no D5 variable-quantity flag was given for it) —
    // flag this to Emanoel if that assumption is wrong.
    { code: "CHORI", name: "Chori Burguer", unit: "unidade", defaultPackageQuantity: null },
    // Chicken and Vegetariano: variable-quantity packages (D5) — defaultPackageQuantity
    // is null by design. Names/units stay in Portuguese: this is seed *data* (product
    // info the team recognizes in bot messages), not code.
    { code: "CHICKEN", name: "Chicken", unit: "pacote", defaultPackageQuantity: null },
    { code: "VEGETARIANO", name: "Vegetariano", unit: "pacote", defaultPackageQuantity: null },
  ];

  for (const supplyData of realSupplies) {
    const [existing] = await db.select().from(supply).where(eq(supply.code, supplyData.code)).limit(1);
    if (existing) {
      console.log(`Supply already existed: ${supplyData.code}`);
      continue;
    }
    await db.insert(supply).values({
      storeId: storeFound.id,
      category: "burger",
      code: supplyData.code,
      name: supplyData.name,
      unit: supplyData.unit,
      defaultPackageQuantity: supplyData.defaultPackageQuantity,
      active: true,
    });
    console.log(`Supply created: ${supplyData.code} (${supplyData.name})`);
  }

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((error) => {
  console.error("Failed to run seed:", error);
  process.exit(1);
});
