import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as dailyIngestionRunRepo from "src/persistence/repositories/dailyIngestionRunRepo.js";
import { createTestStore, getTestDb, resetDatabase } from "src/persistence/repositories/testUtils.js";

const db = getTestDb();

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(async () => {
  await resetDatabase(db);
});

describe("dailyIngestionRunRepo", () => {
  it("reports no run for a date/type that was never recorded", async () => {
    const testStore = await createTestStore(db);

    expect(await dailyIngestionRunRepo.hasRunForDate(db, testStore.id, "2026-07-22", "sale")).toBe(false);
  });

  it("reports a run once recorded", async () => {
    const testStore = await createTestStore(db);

    await dailyIngestionRunRepo.recordRun(db, testStore.id, "2026-07-22", "sale");

    expect(await dailyIngestionRunRepo.hasRunForDate(db, testStore.id, "2026-07-22", "sale")).toBe(true);
  });

  it("does not confuse a run recorded for one date with another date", async () => {
    const testStore = await createTestStore(db);

    await dailyIngestionRunRepo.recordRun(db, testStore.id, "2026-07-21", "sale");

    expect(await dailyIngestionRunRepo.hasRunForDate(db, testStore.id, "2026-07-22", "sale")).toBe(false);
  });

  it("does not confuse a run recorded for one type with another type, same date", async () => {
    const testStore = await createTestStore(db);

    await dailyIngestionRunRepo.recordRun(db, testStore.id, "2026-07-22", "sale");

    expect(await dailyIngestionRunRepo.hasRunForDate(db, testStore.id, "2026-07-22", "receipt")).toBe(false);
    expect(await dailyIngestionRunRepo.hasRunForDate(db, testStore.id, "2026-07-22", "waste")).toBe(false);
  });

  it("is idempotent — recording the same (store, date, type) twice does not throw", async () => {
    const testStore = await createTestStore(db);

    await dailyIngestionRunRepo.recordRun(db, testStore.id, "2026-07-22", "sale");
    await expect(dailyIngestionRunRepo.recordRun(db, testStore.id, "2026-07-22", "sale")).resolves.not.toThrow();
  });

  describe("hasAllTypesRunForDate", () => {
    it("is false when no type has run yet", async () => {
      const testStore = await createTestStore(db);

      expect(await dailyIngestionRunRepo.hasAllTypesRunForDate(db, testStore.id, "2026-07-22")).toBe(false);
    });

    it("is false when only some types have run", async () => {
      const testStore = await createTestStore(db);
      await dailyIngestionRunRepo.recordRun(db, testStore.id, "2026-07-22", "sale");
      await dailyIngestionRunRepo.recordRun(db, testStore.id, "2026-07-22", "receipt");
      // "waste" not recorded.

      expect(await dailyIngestionRunRepo.hasAllTypesRunForDate(db, testStore.id, "2026-07-22")).toBe(false);
    });

    it("is true once sale, receipt, and waste have all run for the date", async () => {
      const testStore = await createTestStore(db);
      await dailyIngestionRunRepo.recordRun(db, testStore.id, "2026-07-22", "sale");
      await dailyIngestionRunRepo.recordRun(db, testStore.id, "2026-07-22", "receipt");
      await dailyIngestionRunRepo.recordRun(db, testStore.id, "2026-07-22", "waste");

      expect(await dailyIngestionRunRepo.hasAllTypesRunForDate(db, testStore.id, "2026-07-22")).toBe(true);
    });
  });
});
