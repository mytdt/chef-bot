import {
  boolean,
  doublePrecision,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const supplyCategoryEnum = pgEnum("supply_category", ["burger", "cheese", "sauce", "potato", "flavors_house"]);

export const verificationTypeEnum = pgEnum("verification_type", [
  "expected_numeric",
  "binary",
  "value_range",
  "expiration",
  "photo_evidence",
]);

export const frequencyEnum = pgEnum("frequency", ["daily", "every_n_days", "weekly", "monthly"]);

export const criticalityEnum = pgEnum("criticality", ["low", "medium", "high"]);

export const movementTypeEnum = pgEnum("movement_type", ["receipt", "sale", "waste"]);

export const movementSourceEnum = pgEnum("movement_source", ["manual", "3scheckout_api", "xml_drive"]);

// C5/D10: which LLM produced the structured parse — "claude" is primary, "gemini" only
// appears when the fallback kicked in (timeout/5xx/429 from Claude).
export const llmProviderEnum = pgEnum("llm_provider", ["claude", "gemini"]);

// doublePrecision (not integer) because supplies can be counted in fractional units
// (kg, liters) for some categories. Burgers specifically are always whole units —
// that invariant is enforced at the input boundary (domain/quantityRules.ts), not
// here, so this schema stays generic enough for future categories without a
// migration. See domain/quantityRules.ts for the full rationale.
const quantity = (columnName: string) => doublePrecision(columnName);

export const store = pgTable("store", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  telegramGroupId: text("telegram_group_id").notNull(),
  active: boolean("active").notNull().default(true),
});

export const supply = pgTable("supply", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => store.id),
  category: supplyCategoryEnum("category").notNull(),
  // Short token collaborators actually type in free-text counts (e.g. "G", "F", "W") —
  // distinct from `name`, the human-readable display name (e.g. "Burger de 160g").
  // The LLM-parsed count flow matches on `code`; manual movement commands match on `name`.
  code: text("code").notNull(),
  name: text("name").notNull(),
  unit: text("unit").notNull(),
  defaultPackageQuantity: quantity("default_package_quantity"),
  active: boolean("active").notNull().default(true),
});

export const routine = pgTable("routine", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => store.id),
  name: text("name").notNull(),
  verificationType: verificationTypeEnum("verification_type").notNull(),
  frequency: frequencyEnum("frequency").notNull(),
  criticality: criticalityEnum("criticality").notNull(),
  active: boolean("active").notNull().default(true),
});

export const count = pgTable("count", {
  id: uuid("id").primaryKey().defaultRandom(),
  routineId: uuid("routine_id")
    .notNull()
    .references(() => routine.id),
  supplyId: uuid("supply_id")
    .notNull()
    .references(() => supply.id),
  collaboratorTelegramId: text("collaborator_telegram_id").notNull(),
  rawText: text("raw_text").notNull(),
  reportedValue: quantity("reported_value").notNull(),
  actualQuantityReported: quantity("actual_quantity_reported"),
  expectedValue: quantity("expected_value").notNull(),
  matched: boolean("matched").notNull(),
  confirmedByCollaborator: boolean("confirmed_by_collaborator").notNull().default(false),
  llmUsed: llmProviderEnum("llm_used").notNull().default("claude"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// C6: alert is a one-shot notification to the group — no acknowledgment/escalation
// state (removed, amends D2/D12). Kept as a table (not just a sent message) purely as
// an audit trail of which counts triggered a mismatch notification.
export const alert = pgTable("alert", {
  id: uuid("id").primaryKey().defaultRandom(),
  countId: uuid("count_id")
    .notNull()
    .references(() => count.id),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inventoryMovement = pgTable("inventory_movement", {
  id: uuid("id").primaryKey().defaultRandom(),
  supplyId: uuid("supply_id")
    .notNull()
    .references(() => supply.id),
  type: movementTypeEnum("type").notNull(),
  quantity: quantity("quantity").notNull(),
  source: movementSourceEnum("source").notNull().default("manual"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

// B3: tracks which Drive files (by their stable Drive file id) have already been
// ingested, so re-running the daily ingestion (D11: manual trigger, no scheduler) never
// double-counts InventoryMovement rows. Identity-based (by file id), not content-based —
// two different NFC-e documents can legitimately produce identical movement rows (same
// product, same quantity, same day), so only "was this exact file processed before" is a
// sound idempotency check. The unique constraint enforces this at the DB level too, not
// just in application logic.
export const processedSalesFile = pgTable(
  "processed_sales_file",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id),
    driveFileId: text("drive_file_id").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.storeId, table.driveFileId)],
);
