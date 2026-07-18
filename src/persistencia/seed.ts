import "dotenv/config";
import { eq } from "drizzle-orm";
import { criarDb } from "src/persistencia/db.js";
import { insumo, loja, rotina } from "src/persistencia/schema.js";

const NOME_LOJA = "Bom Beef 0032";
const NOME_ROTINA = "Contagem de Carne";

// PLACEHOLDER: preencher com o telegram_group_id real do grupo de staging/produção antes do E2E.
const TELEGRAM_GROUP_ID_PLACEHOLDER = "PLACEHOLDER_TELEGRAM_GROUP_ID_PREENCHER";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL não definida.");
  }
  const db = criarDb({ DATABASE_URL: databaseUrl });

  let [lojaExistente] = await db.select().from(loja).where(eq(loja.nome, NOME_LOJA)).limit(1);
  if (!lojaExistente) {
    [lojaExistente] = await db
      .insert(loja)
      .values({ nome: NOME_LOJA, telegramGroupId: TELEGRAM_GROUP_ID_PLACEHOLDER, ativa: true })
      .returning();
    console.log(`Loja criada: ${lojaExistente?.id}`);
  } else {
    console.log(`Loja já existia: ${lojaExistente.id}`);
  }
  if (!lojaExistente) {
    throw new Error("Falha ao criar/buscar loja.");
  }

  const [rotinaExistente] = await db
    .select()
    .from(rotina)
    .where(eq(rotina.nome, NOME_ROTINA))
    .limit(1);
  if (!rotinaExistente) {
    await db.insert(rotina).values({
      lojaId: lojaExistente.id,
      nome: NOME_ROTINA,
      tipoVerificacao: "numerica_esperada",
      frequencia: "diaria",
      criticidade: "alta",
      ativa: true,
    });
    console.log("Rotina 'Contagem de Carne' criada.");
  } else {
    console.log("Rotina 'Contagem de Carne' já existia.");
  }

  // PLACEHOLDER: os nomes/códigos reais usados no texto livre (ex.: G, F, W do exemplo do
  // SPEC "742 G / 689 F / 380 W") ainda não foram informados — preencher nome/unidade/
  // quantidade_padrao_por_pacote reais antes de rodar o fluxo E2E de verdade.
  const insumosPlaceholder = [
    { nome: "PLACEHOLDER_INSUMO_G", unidade: "unidade", quantidadePadraoPorPacote: null },
    { nome: "PLACEHOLDER_INSUMO_F", unidade: "unidade", quantidadePadraoPorPacote: null },
    { nome: "PLACEHOLDER_INSUMO_W", unidade: "unidade", quantidadePadraoPorPacote: null },
    // Chicken e Vegetariano: pacotes de quantidade variável (D5) — quantidade_padrao_por_pacote
    // fica null por design, não é placeholder a preencher.
    { nome: "Chicken", unidade: "pacote", quantidadePadraoPorPacote: null },
    { nome: "Vegetariano", unidade: "pacote", quantidadePadraoPorPacote: null },
  ];

  for (const dadosInsumo of insumosPlaceholder) {
    const [existente] = await db
      .select()
      .from(insumo)
      .where(eq(insumo.nome, dadosInsumo.nome))
      .limit(1);
    if (existente) {
      console.log(`Insumo já existia: ${dadosInsumo.nome}`);
      continue;
    }
    await db.insert(insumo).values({
      lojaId: lojaExistente.id,
      categoria: "burger",
      nome: dadosInsumo.nome,
      unidade: dadosInsumo.unidade,
      quantidadePadraoPorPacote: dadosInsumo.quantidadePadraoPorPacote,
      ativo: true,
    });
    console.log(`Insumo criado: ${dadosInsumo.nome}`);
  }

  console.log("Seed concluído.");
  process.exit(0);
}

main().catch((error) => {
  console.error("Falha ao rodar seed:", error);
  process.exit(1);
});
