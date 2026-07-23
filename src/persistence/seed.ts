import "dotenv/config";
import { eq } from "drizzle-orm";
import { createDb } from "src/persistence/db.js";
import { supply, store, routine } from "src/persistence/schema.js";
import { parseTelegramGroupId } from "src/domain/telegramGroupId.js";

const STORE_NAME = "Bom Beef 0032";
const ROUTINE_NAME = "Contagem de Carne";

// Real staging group id, confirmed by Emanoel (2026-07-21). Must stay negative:
// Telegram group chat ids are always negative, and D9 auth does an exact string
// compare — a missing "-" silently drops every message (see telegramGroupId.ts).
const TELEGRAM_GROUP_ID = parseTelegramGroupId("-5107923619");

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
  } else if (storeFound.telegramGroupId !== TELEGRAM_GROUP_ID) {
    // Same idempotent spirit as unitsPerBox below: a wrong group id (missing "-")
    // silently breaks D9 auth — keep the seeded value in sync on every run.
    [storeFound] = await db
      .update(store)
      .set({ telegramGroupId: TELEGRAM_GROUP_ID })
      .where(eq(store.id, storeFound.id))
      .returning();
    console.log(`Store updated: telegramGroupId -> ${TELEGRAM_GROUP_ID}`);
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
    // unitsPerBox (B5, confirmed 22/07): fixed conversion factor for receiving notes
    // (NFe modelo 55, quantity in boxes) — null where receipt-by-box doesn't apply.
    { code: "F", name: "Burger de 90g", unit: "unidade", defaultPackageQuantity: null, unitsPerBox: 54 },
    { code: "G", name: "Burger de 160g", unit: "unidade", defaultPackageQuantity: null, unitsPerBox: 36 },
    { code: "W", name: "Burger de Wagyu de 200g", unit: "unidade", defaultPackageQuantity: null, unitsPerBox: 30 },
    // Assumed fixed-quantity like F/G/W (no D5 variable-quantity flag was given for it) —
    // flag this to Emanoel if that assumption is wrong.
    { code: "CHORI", name: "Chori Burguer", unit: "unidade", defaultPackageQuantity: null, unitsPerBox: null },
    // Chicken and Vegetariano: `unit` stays "pacote" as display/master-data hint only —
    // count lines may be package (PCT) or unit (e.g. CHICKEN SESSÃO / bare VEGETARIANO);
    // the message's unitKind is the source of truth (see PLAN.md §8.8). D5
    // actualQuantityReported still overrides the aggregated total when explicitly given.
    // Count package→unit factors live in domain/countPackageFactors.ts (not unitsPerBox).
    { code: "CHICKEN", name: "Chicken", unit: "pacote", defaultPackageQuantity: null, unitsPerBox: null },
    { code: "VEGETARIANO", name: "Vegetariano", unit: "pacote", defaultPackageQuantity: null, unitsPerBox: null },
  ];

  for (const supplyData of realSupplies) {
    const [existing] = await db.select().from(supply).where(eq(supply.code, supplyData.code)).limit(1);
    if (existing) {
      // unitsPerBox is master data added after some supplies may already have been
      // seeded (B5) — kept in sync on every seed run instead of only at creation time,
      // same idempotent spirit as the rest of this script.
      if (existing.unitsPerBox !== supplyData.unitsPerBox) {
        await db.update(supply).set({ unitsPerBox: supplyData.unitsPerBox }).where(eq(supply.id, existing.id));
        console.log(`Supply updated: ${supplyData.code} (unitsPerBox -> ${supplyData.unitsPerBox})`);
      } else {
        console.log(`Supply already existed: ${supplyData.code}`);
      }
      continue;
    }
    await db.insert(supply).values({
      storeId: storeFound.id,
      category: "burger",
      code: supplyData.code,
      name: supplyData.name,
      unit: supplyData.unit,
      defaultPackageQuantity: supplyData.defaultPackageQuantity,
      unitsPerBox: supplyData.unitsPerBox,
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
