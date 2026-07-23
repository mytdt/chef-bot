import {
  boolean,
  date,
  doublePrecision,
  integer,
  jsonb,
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

export const supply = pgTable(
  "supply",
  {
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
    // Store-internal numeric SKU from back-office exports (receipts XLSX / waste incomplete).
    // Nullable: burgers counted as G/F/W often have no numeric SKU yet. Receipt ingestion
    // looks up by this field (findBySku), not by free-text `code`.
    sku: integer("sku"),
    // Legacy master data for box→unit conversion (NFe mod 55 path, removed). Kept nullable
    // for now; receipt XLSX uses pre-converted "Qtd. Estoque" and does not read this.
    // Distinct from count-message package→unit factors (domain/countPackageFactors.ts).
    //
    // `unit` is a display/master-data hint only: the truth of whether a count *line* is a
    // package or a unit comes from the message's unitKind (PCT/CX vs bare), not this field
    // (Chicken/Vegetariano appear both ways in the same count).
    unitsPerBox: integer("units_per_box"),
    active: boolean("active").notNull().default(true),
  },
  (table) => [unique().on(table.storeId, table.sku)],
);

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

/**
 * Per-location detail for a Count (S1). Null on baseline/seed-manual rows and any
 * pre-feature counts — `reportedValue` alone remains the aggregate used by expected.
 * Comparison never reads this column.
 */
export type CountLocationBreakdown = {
  mezanino: { units: number; lines: CountLocationBreakdownLine[] };
  cozinha: { units: number; lines: CountLocationBreakdownLine[] };
};

export type CountLocationBreakdownLine = {
  supplyRaw: string;
  quantity: number;
  unitKind: "unit" | "package";
  units: number;
};

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
  // Aggregate units across Mezanino+Cozinha (post package→unit conversion). Still the
  // only quantity the expected-value formula / match decision use.
  reportedValue: quantity("reported_value").notNull(),
  // D5: optional override of the *aggregate* total (not per-location). Coexists with
  // fixed count-package factors — factors convert lines; this overrides the final total.
  actualQuantityReported: quantity("actual_quantity_reported"),
  // Audit/D1 detail only. Null for seed-manual baseline rows (no backfill required).
  locationBreakdown: jsonb("location_breakdown").$type<CountLocationBreakdown>(),
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

// B5: same identity-based idempotency as processedSalesFile, for supplier-notes XLSX
// under recebimentos/ — a separate table (not a shared one with a `type` discriminator)
// mirrors the existing table 1:1, keeping each ingestion type's tracking independent
// and trivially easy to reason about.
export const processedReceiptFile = pgTable(
  "processed_receipt_file",
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

// B6: same idempotency pattern, for waste reports (both "Completo" and "Incompleto"
// share this one table — they're different Drive files with different ids, so
// per-file-id uniqueness already keeps them independent without needing a report-type
// column here).
export const processedWasteFile = pgTable(
  "processed_waste_file",
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

// B3 bot integration: distinct from processedSalesFile (which tracks individual files
// by id) — this tracks "was the daily ingestion command run at all for this date",
// including a day where it ran and found zero files (store closed, no sales yet). That
// distinction matters: a Count can only be compared once we know the day's ingestion
// was actually attempted, not just inferred from an empty processedSalesFile result.
//
// `type` (2026-07-22 fix): originally untyped, implicitly "sales only" — a count could
// be released for comparison as soon as *any* ingestion ran, even if receipts/waste for
// that day hadn't been. Now one row per (store, date, type), and the "estado de espera"
// (confirmation.ts) requires all three movementTypeEnum values before releasing a
// count — see dailyIngestionRunRepo.hasAllTypesRunForDate.
export const dailyIngestionRun = pgTable(
  "daily_ingestion_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id),
    date: date("date").notNull(),
    type: movementTypeEnum("type").notNull(),
    ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.storeId, table.date, table.type)],
);

// B3 bot integration: a confirmed count whose date's XML hasn't been ingested yet
// (dailyIngestionRun has no row for it) is parked here instead of becoming a Count
// immediately — Count stays immutable (see comment on countRepo.insert), so a count
// that isn't ready to be compared yet must not exist as a Count row at all. Resumed
// automatically by ingestionResume.ts once /ingest_xml runs for that date.
export const awaitingIngestionCount = pgTable("awaiting_ingestion_count", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => store.id),
  routineId: uuid("routine_id")
    .notNull()
    .references(() => routine.id),
  collaboratorTelegramId: text("collaborator_telegram_id").notNull(),
  chatId: text("chat_id").notNull(),
  rawText: text("raw_text").notNull(),
  date: date("date").notNull(),
  // Post-conversion aggregated items (same shape persisted on Count) — raw nested parse
  // is not re-stored here; rawText remains the source of truth for the original message.
  // Pre-feature awaiting rows (flat CountItem) are discarded on deploy if any exist in
  // staging — collaborator re-sends; see PR notes.
  items: jsonb("items")
    .$type<
      {
        supply: string;
        quantity: number;
        actualQuantity: number | null;
        locationBreakdown: CountLocationBreakdown;
      }[]
    >()
    .notNull(),
  // C5: preserved so resume after /ingest_xml still records which LLM produced the parse.
  llmUsed: llmProviderEnum("llm_used").notNull().default("claude"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
