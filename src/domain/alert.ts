import type { Db } from "src/persistence/db.js";
import * as alertRepo from "src/persistence/repositories/alertRepo.js";

export async function createAlert(db: Db, countId: string) {
  return alertRepo.insert(db, countId);
}
