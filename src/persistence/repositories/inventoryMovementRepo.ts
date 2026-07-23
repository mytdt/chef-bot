import { and, eq, gt } from "drizzle-orm";
import type { Db } from "src/persistence/db.js";
import { inventoryMovement } from "src/persistence/schema.js";
import type { MovementsSinceLastCount } from "src/calculation/expected.js";
import type { MovementSource, MovementType } from "src/domain/types.js";

export async function insert(
  db: Db,
  data: {
    supplyId: string;
    type: MovementType;
    quantity: number;
    source?: MovementSource;
    /** When set (e.g. receipt XLSX "Recebido"), overrides DB defaultNow() for attribution. */
    recordedAt?: Date;
  },
) {
  const [created] = await db
    .insert(inventoryMovement)
    .values({
      supplyId: data.supplyId,
      type: data.type,
      quantity: data.quantity,
      source: data.source ?? "manual",
      ...(data.recordedAt !== undefined ? { recordedAt: data.recordedAt } : {}),
    })
    .returning();
  if (!created) {
    throw new Error("Failed to insert movement.");
  }
  return created;
}

/**
 * Sums receipts/sales/waste for a supply since a given date (normally the date of
 * the last confirmed count), used as input to calculateExpectedValue.
 */
export async function sumSince(db: Db, supplyId: string, since: Date): Promise<MovementsSinceLastCount> {
  const movements = await db
    .select()
    .from(inventoryMovement)
    .where(and(eq(inventoryMovement.supplyId, supplyId), gt(inventoryMovement.recordedAt, since)));

  return movements.reduce<MovementsSinceLastCount>(
    (totals, movement) => {
      if (movement.type === "receipt") totals.receipts += movement.quantity;
      if (movement.type === "sale") totals.sales += movement.quantity;
      if (movement.type === "waste") totals.waste += movement.quantity;
      return totals;
    },
    { receipts: 0, sales: 0, waste: 0 },
  );
}
