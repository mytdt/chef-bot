import type { Db } from "src/persistencia/db.js";
import * as alertaRepo from "src/persistencia/repositories/alertaRepo.js";

export async function criarAlerta(db: Db, contagemId: string) {
  return alertaRepo.inserir(db, contagemId);
}

export async function reconhecerAlerta(db: Db, alertaId: string, reconhecidoPor: string) {
  await alertaRepo.marcarReconhecido(db, alertaId, reconhecidoPor);
}
