import {
  boolean,
  doublePrecision,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const categoriaInsumoEnum = pgEnum("categoria_insumo", [
  "burger",
  "queijo",
  "molho",
  "batata",
  "flavors_house",
]);

export const tipoVerificacaoEnum = pgEnum("tipo_verificacao", [
  "numerica_esperada",
  "binaria",
  "faixa_valor",
  "validade",
  "foto_evidencia",
]);

export const frequenciaEnum = pgEnum("frequencia", ["diaria", "a_cada_n_dias", "semanal", "mensal"]);

export const criticidadeEnum = pgEnum("criticidade", ["baixa", "media", "alta"]);

export const tipoMovimentoEnum = pgEnum("tipo_movimento", ["recebimento", "venda", "desperdicio"]);

export const origemMovimentoEnum = pgEnum("origem_movimento", ["manual", "3scheckout_api"]);

// doublePrecision (não integer) porque insumos podem ser contados em unidades
// fracionárias (kg). Precisão de ponto flutuante é aceitável para contagem de
// estoque de comida — não é um domínio que exige decimal exato como o financeiro.
const quantidade = (nomeColuna: string) => doublePrecision(nomeColuna);

export const loja = pgTable("loja", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  telegramGroupId: text("telegram_group_id").notNull(),
  ativa: boolean("ativa").notNull().default(true),
});

export const insumo = pgTable("insumo", {
  id: uuid("id").primaryKey().defaultRandom(),
  lojaId: uuid("loja_id")
    .notNull()
    .references(() => loja.id),
  categoria: categoriaInsumoEnum("categoria").notNull(),
  nome: text("nome").notNull(),
  unidade: text("unidade").notNull(),
  quantidadePadraoPorPacote: quantidade("quantidade_padrao_por_pacote"),
  ativo: boolean("ativo").notNull().default(true),
});

export const rotina = pgTable("rotina", {
  id: uuid("id").primaryKey().defaultRandom(),
  lojaId: uuid("loja_id")
    .notNull()
    .references(() => loja.id),
  nome: text("nome").notNull(),
  tipoVerificacao: tipoVerificacaoEnum("tipo_verificacao").notNull(),
  frequencia: frequenciaEnum("frequencia").notNull(),
  criticidade: criticidadeEnum("criticidade").notNull(),
  ativa: boolean("ativa").notNull().default(true),
});

export const contagem = pgTable("contagem", {
  id: uuid("id").primaryKey().defaultRandom(),
  rotinaId: uuid("rotina_id")
    .notNull()
    .references(() => rotina.id),
  insumoId: uuid("insumo_id")
    .notNull()
    .references(() => insumo.id),
  colaboradorTelegramId: text("colaborador_telegram_id").notNull(),
  textoBruto: text("texto_bruto").notNull(),
  valorInformado: quantidade("valor_informado").notNull(),
  quantidadeRealInformada: quantidade("quantidade_real_informada"),
  valorEsperado: quantidade("valor_esperado").notNull(),
  bateu: boolean("bateu").notNull(),
  confirmadoPeloColaborador: boolean("confirmado_pelo_colaborador").notNull().default(false),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const alerta = pgTable("alerta", {
  id: uuid("id").primaryKey().defaultRandom(),
  contagemId: uuid("contagem_id")
    .notNull()
    .references(() => contagem.id),
  enviadoEm: timestamp("enviado_em", { withTimezone: true }).notNull().defaultNow(),
  reconhecido: boolean("reconhecido").notNull().default(false),
  reconhecidoPor: text("reconhecido_por"),
  reconhecidoEm: timestamp("reconhecido_em", { withTimezone: true }),
  escalonado: boolean("escalonado").notNull().default(false),
  escalonadoPara: text("escalonado_para"),
});

export const historicoMovimento = pgTable("historico_movimento", {
  id: uuid("id").primaryKey().defaultRandom(),
  insumoId: uuid("insumo_id")
    .notNull()
    .references(() => insumo.id),
  tipo: tipoMovimentoEnum("tipo").notNull(),
  quantidade: quantidade("quantidade").notNull(),
  origem: origemMovimentoEnum("origem").notNull().default("manual"),
  registradoEm: timestamp("registrado_em", { withTimezone: true }).notNull().defaultNow(),
});
