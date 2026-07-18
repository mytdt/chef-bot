import {
  boolean,
  doublePrecision,
  pgEnum,
  pgTable,
  text,
  timestamp,
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

export const movementSourceEnum = pgEnum("movement_source", ["manual", "3scheckout_api"]);

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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const alert = pgTable("alert", {
  id: uuid("id").primaryKey().defaultRandom(),
  countId: uuid("count_id")
    .notNull()
    .references(() => count.id),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  acknowledged: boolean("acknowledged").notNull().default(false),
  acknowledgedBy: text("acknowledged_by"),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  escalated: boolean("escalated").notNull().default(false),
  escalatedTo: text("escalated_to"),
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
