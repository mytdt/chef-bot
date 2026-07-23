import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { count } from "src/persistence/schema.js";
import * as countRepo from "src/persistence/repositories/countRepo.js";
import {
  BASELINE_COLLABORATOR_TELEGRAM_ID,
  BASELINE_RAW_TEXT,
  parseBaselineCutoff,
  seedBaselineCounts,
} from "src/persistence/seedBaselineCounts.js";
import {
  createTestRoutine,
  createTestStore,
  createTestSupply,
  getTestDb,
  resetDatabase,
} from "src/persistence/repositories/testUtils.js";

const db = getTestDb();

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(async () => {
  await resetDatabase(db);
});

describe("parseBaselineCutoff", () => {
  it("parses local Brazil wall-clock as UTC−03:00", () => {
    const parsed = parseBaselineCutoff("2026-07-20 23:59:59");
    expect(parsed.toISOString()).toBe("2026-07-21T02:59:59.000Z");
  });

  it("rejects a malformed cutoff string with a clear error", () => {
    expect(() => parseBaselineCutoff("20/07/2026")).toThrow(/Invalid cutoffAt/);
  });
});

describe("seedBaselineCounts", () => {
  it("inserts matched/confirmed baseline rows with the explicit cutoff createdAt", async () => {
    const testStore = await createTestStore(db, { active: true });
    await createTestRoutine(db, testStore.id, { name: "Contagem de Carne" });
    const supplyG = await createTestSupply(db, testStore.id, { code: "G", name: "Burger G" });
    const supplyF = await createTestSupply(db, testStore.id, { code: "F", name: "Burger F" });

    const cutoffAt = "2026-07-20 23:59:59";
    const results = await seedBaselineCounts(db, {
      cutoffAt,
      items: [
        { supplyCode: "G", quantity: 742 },
        { supplyCode: "F", quantity: 689 },
      ],
    });

    expect(results).toEqual([
      expect.objectContaining({ supplyCode: "G", status: "inserted", quantity: 742 }),
      expect.objectContaining({ supplyCode: "F", status: "inserted", quantity: 689 }),
    ]);

    const expectedCutoff = parseBaselineCutoff(cutoffAt);
    const rowG = await countRepo.findById(db, results[0]!.countId);
    expect(rowG).toMatchObject({
      supplyId: supplyG.id,
      reportedValue: 742,
      expectedValue: 742,
      matched: true,
      confirmedByCollaborator: true,
      collaboratorTelegramId: BASELINE_COLLABORATOR_TELEGRAM_ID,
      rawText: BASELINE_RAW_TEXT,
    });
    expect(rowG?.createdAt.getTime()).toBe(expectedCutoff.getTime());

    const last = await countRepo.findLastConfirmedBySupply(db, supplyG.id);
    expect(last?.id).toBe(rowG?.id);

    const rowF = await countRepo.findById(db, results[1]!.countId);
    expect(rowF?.supplyId).toBe(supplyF.id);
    expect(rowF?.createdAt.getTime()).toBe(expectedCutoff.getTime());
  });

  it("is idempotent: second run for the same supply + cutoff skips instead of duplicating", async () => {
    const testStore = await createTestStore(db, { active: true });
    await createTestRoutine(db, testStore.id, { name: "Contagem de Carne" });
    await createTestSupply(db, testStore.id, { code: "G", name: "Burger G" });

    const config = {
      cutoffAt: "2026-07-20T23:59:59-03:00",
      items: [{ supplyCode: "G", quantity: 100 }],
    };

    const first = await seedBaselineCounts(db, config);
    const second = await seedBaselineCounts(db, config);

    expect(first[0]?.status).toBe("inserted");
    expect(second[0]?.status).toBe("skipped");
    expect(second[0]?.countId).toBe(first[0]?.countId);

    const rows = await db.select().from(count).where(eq(count.collaboratorTelegramId, BASELINE_COLLABORATOR_TELEGRAM_ID));
    expect(rows).toHaveLength(1);
    // Quantity from the first insert is kept — skip never overwrites.
    expect(rows[0]?.reportedValue).toBe(100);
  });

  it("throws a clear error when a supplyCode does not exist for the active store", async () => {
    const testStore = await createTestStore(db, { active: true });
    await createTestRoutine(db, testStore.id, { name: "Contagem de Carne" });
    await createTestSupply(db, testStore.id, { code: "G", name: "Burger G" });

    await expect(
      seedBaselineCounts(db, {
        cutoffAt: "2026-07-20 23:59:59",
        items: [{ supplyCode: "NOPE", quantity: 10 }],
      }),
    ).rejects.toThrow(/Supply code "NOPE" not found/);
  });
});
