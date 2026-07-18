import { describe, expect, it } from "vitest";
import { deveEscalar, filtrarAlertasParaEscalar } from "src/alertas/escalonamento.js";

const agora = new Date("2026-07-17T12:00:00Z");
const minutosAtras = (min: number) => new Date(agora.getTime() - min * 60 * 1000);

describe("deveEscalar", () => {
  it("não escala antes do timeout", () => {
    const alerta = { id: "1", enviadoEm: minutosAtras(10), reconhecido: false, escalonado: false };
    expect(deveEscalar(alerta, agora, 15)).toBe(false);
  });

  it("escala exatamente no timeout", () => {
    const alerta = { id: "1", enviadoEm: minutosAtras(15), reconhecido: false, escalonado: false };
    expect(deveEscalar(alerta, agora, 15)).toBe(true);
  });

  it("escala depois do timeout", () => {
    const alerta = { id: "1", enviadoEm: minutosAtras(20), reconhecido: false, escalonado: false };
    expect(deveEscalar(alerta, agora, 15)).toBe(true);
  });

  it("não escala se já foi reconhecido, mesmo após o timeout", () => {
    const alerta = { id: "1", enviadoEm: minutosAtras(30), reconhecido: true, escalonado: false };
    expect(deveEscalar(alerta, agora, 15)).toBe(false);
  });

  it("não escala de novo se já foi escalonado", () => {
    const alerta = { id: "1", enviadoEm: minutosAtras(30), reconhecido: false, escalonado: true };
    expect(deveEscalar(alerta, agora, 15)).toBe(false);
  });
});

describe("filtrarAlertasParaEscalar", () => {
  it("retorna só os alertas elegíveis, sobrevivendo a restart (decisão derivada só de enviadoEm)", () => {
    const alertas = [
      { id: "dentro-do-prazo", enviadoEm: minutosAtras(5), reconhecido: false, escalonado: false },
      { id: "estourou-prazo", enviadoEm: minutosAtras(16), reconhecido: false, escalonado: false },
      { id: "ja-reconhecido", enviadoEm: minutosAtras(20), reconhecido: true, escalonado: false },
    ];

    const resultado = filtrarAlertasParaEscalar(alertas, agora, 15);

    expect(resultado.map((a) => a.id)).toEqual(["estourou-prazo"]);
  });
});
