/**
 * Status: decisões da §8 fechadas com o Emanoel (2026-07-23) — ver implementação
 * na branch `feature/count-by-location`. Este arquivo permanece como registro do
 * desenho; a checklist abaixo está resolvida.
 */

---

## 0. Inconsistências com o código atual (parar e alinhar antes de implementar)

Estas não são “detalhes de implementação” — são tensões reais entre as decisões novas e o que o repo faz hoje. **Não encaixar à força.**

### 0.1 D5 (`actualQuantityReported`) vs fatores fixos de contagem

| Hoje (D5 / seed / prompts) | Decisão nova |
|---|---|
| Chicken/Vegetariano são pacotes de **quantidade variável**; o colaborador pode informar a qtd real ao abrir (`actualQuantity`), e isso vira override pontual. | Conversão **determinística no código**: Chicken PCT × 20, Vegetariano PCT × 2. Comparação **exata**, sem margem. |
| `Supply.defaultPackageQuantity = null` de propósito (variável). | Fator de conversão na contagem é número fixo conhecido. |
| Prompt LLM pede `actualQuantity` quando o texto menciona “abriu o pacote e tinha 8.5”. | LLM **não faz matemática**; extrai bruto (local, insumo, qtd, flag PCT/CX). |

**Pergunta obrigatória:** D5 continua existindo no fluxo novo?

- **Hipótese A:** D5 fica só para override excepcional (mensagem rara com “real informada”), e o caminho feliz é sempre fator fixo.
- **Hipótese B:** D5 na prática morre para Chicken/Vegetariano — o ×20/×2 substitui o override; `actualQuantity` some do parse (ou fica sem uso).
- **Hipótese C:** D5 passa a significar outra coisa (ex.: override do **total agregado** pós-conversão, quando o humano discorda do ×20).

Sem essa decisão, qualquer desenho de schema/parse arrisca modelar o campo errado.

### 0.2 Lookup de Supply já quebraria o formato real

Hoje:

- LLM é instruído a **preservar o token como aparece** (`"PCT CHICKEN"`, etc.).
- `processCountItem` faz `supplyRepo.findByCode(db, storeId, item.supply)` com `ilike` no `code` (`CHICKEN`, `G`, …).

Consequência: `"PCT CHICKEN"` e `"CHICKEN SESSÃO"` **não batem** em `CHICKEN`. O exemplo real da mensagem **ainda não é suportado** pelo pipeline atual — não é só “falta local”.

A normalização de alias (`PCT CHICKEN` / `CHICKEN SESSÃO` / `VEGETARIANO` → código canônico + flag de unidade) precisa ser **código determinístico pós-LLM**, não confiança no modelo devolver `CHICKEN` limpo.

### 0.3 `Supply.unit` e `defaultPackageQuantity`

- Chicken/Vegetariano estão com `unit: "pacote"` e `defaultPackageQuantity: null`.
- No formato real, o **mesmo** insumo aparece como pacote (`9 PCT CHICKEN`) **e** como unidade (`6 CHICKEN SESSÃO`, `5 VEGETARIANO` sem PCT) na mesma mensagem.

O campo `unit` deixa de descrever “como se conta” de forma única. Não bloqueia o MVP se a regra PCT/CX viver no parse, mas o seed/documentação atual mentem sobre o domínio.

### 0.4 PCT/CX em insumos **sem** fator definido

Decisão 3: “vale pra qualquer insumo”. Decisão 4 só lista fatores para Chicken e Vegetariano.

**Pergunta:** o que fazer se o LLM extrair `{ supply: "G", unitKind: "package", quantity: 2 }`?

- Erro alto (falha o item / a contagem)?
- Tratar como unidade (ignorar PCT — perigoso)?
- Exigir fator cadastrado e pular com skip reportado (padrão B1/B5/B6)?

### 0.5 O que *não* está inconsistente (alinhado)

- Comparação **agregada** por insumo + fórmula `Esperado = Recebimento + Contagem Anterior − Vendas − Desperdício` → já é o modelo de `Count` / `calculateExpectedValue` / movimentos. Locais são detalhe de **entrada**, não de estoque esperado.
- Comparação **exata** (`===`) → já é `decideMatch`; decisões 2 e 5 reforçam, não mudam.
- `unitsPerBox` (B5, caixa de recebimento) **não** deve ser reusado para PCT de contagem — correto; são contextos distintos.
- Imutabilidade de `Count` + `rawText` preservado → intactos.

---

## 1. Modelo mental do fluxo novo

```
mensagem Telegram
    → LLM extrai bruto (locais + linhas + flag PCT/CX)     [sem matemática]
    → Zod valida estrutura aninhada
    → código: normaliza alias → aplica fator → agrega por (local, supply) → agrega locais
    → D1: mostra resumo estruturado → colaborador confirma
    → 1 Count por Supply com reportedValue = TOTAL agregado (unidades)
    → comparação / expected / alertas: iguais a hoje (agregado)
```

Exemplo (Chicken na mensagem real):

| Local | Linha bruta | Após conversão (local) |
|---|---|---|
| Mezanino | 9 PCT CHICKEN | 9 × 20 = 180 |
| Cozinha | 8 PCT CHICKEN | 8 × 20 = 160 |
| Cozinha | 6 CHICKEN SESSÃO | 6 (unidade) |
| **Total CHICKEN** | | **180 + 160 + 6 = 346** → `reportedValue` |

Vegetariano: Mezanino `20 PCT` → 40; Cozinha `5` (sem PCT) → 5; total **45**.

---

## 2. Schema de `Count` — opções + migration segura

### 2.1 Invariantes que a migration **não pode quebrar**

- Linhas `collaborator_telegram_id = 'seed-manual'` já existem: `reportedValue` = estoque de corte (agregado), `actualQuantityReported = null`, sem conceito de local.
- `calculateExpectedValue` usa `effectiveValue(previousCount)` = `actualQuantityReported ?? reportedValue`.
- Contagens futuras precisam continuar legíveis como “estoque anterior agregado” para a fórmula.

**Conclusão de desenho (proposta, não decisão final):**  
`reportedValue` permanece o **total agregado em unidades** (pós-conversão, soma dos locais). Locais são **detalhe auditável**, não a unidade de comparação.

### 2.2 Opções de representação do detalhe por local

#### Opção S1 — Colunas JSONB no mesmo `Count` (recomendada para discutir primeiro)

```
count (
  ...campos atuais...
  reportedValue              -- TOTAL agregado (unidades), como hoje
  actualQuantityReported     -- D5: ver pergunta aberta abaixo
  locationBreakdown jsonb    -- NOVO, nullable
)
```

Formato sugerido de `locationBreakdown`:

```json
{
  "mezanino": { "raw": [...], "units": 180 },
  "cozinha":  { "raw": [...], "units": 166 }
}
```

ou, mais simples (só totais por local em unidades já convertidas):

```json
{ "mezanino": 180, "cozinha": 166 }
```

- Migration: `ADD COLUMN location_breakdown jsonb NULL`.
- Rows seed-manual: ficam `NULL` (= “contagem sem breakdown; total em `reportedValue`”).
- Sem backfill obrigatório; sem perder dado.
- Comparação / expected: **não leem** o JSONB.

**Prós:** migration mínima, 1 row/supply como hoje, baseline intacta.  
**Contras:** JSONB menos queryável; precisa schema Zod espelhado na app; `awaiting_ingestion_count.items` também muda (ver §3).

#### Opção S2 — Tabela filha `count_location_line`

```
count_location_line (
  id, count_id FK,
  location enum('mezanino','cozinha'),
  quantity_raw, unit_kind enum('unit','package'),
  quantity_units,  -- pós-conversão naquela linha
  ...
)
```

- `Count.reportedValue` = soma das lines.
- Seed-manual: zero lines + `reportedValue` preenchido.

**Prós:** normalizado, auditável linha a linha (incl. duas linhas Chicken na Cozinha).  
**Contras:** migration + queries + imutabilidade em duas tabelas; mais código.

#### Opção S3 — Um `Count` por (supply, location)

Quebra decisão 2 e a fórmula atual (expected é agregado). **Rejeitar** salvo redesign grande de expected — fora do pedido.

### 2.3 `reportedValue` e D5 — perguntas em aberto (não assumir)

1. **`reportedValue`:** confirmar que continua sendo **só o agregado em unidades** (proposta S1/S2 acima).
2. **`actualQuantityReported` (D5):**
   - Continua override do **total agregado** (um número), ignorando breakdown para `effectiveValue`?
   - Precisa de override **por local** (dois números)?
   - Ou D5 é aposentado no caminho feliz e o campo fica legado/`null` sempre nas contagens novas?
3. **Baseline:** seed continua gravando só agregado sem breakdown — ok?

Recomendação de discussão (não implementação): começar com S1 + D5 ainda só no total (se ainda existir), breakdown só para auditoria/D1; não inventar override por local até alguém pedir com caso real.

---

## 3. `parse.schema.ts` — estrutura aninhada **antes** da conversão

### 3.1 Proposta de shape Zod (bruto, pós-LLM, pré-fator)

```ts
location: z.enum(["mezanino", "cozinha"])

rawCountLineSchema = z.object({
  supplyRaw: z.string().min(1),           // token como no texto ("CHICKEN SESSÃO", "G")
  quantity: z.number().finite(),
  unitKind: z.enum(["unit", "package"]), // package = tinha PCT ou CX
  // actualQuantity?: ver decisão D5 — nullable, só se D5 sobreviver
})

locationBlockSchema = z.object({
  location: locationSchema,
  lines: z.array(rawCountLineSchema).min(1),
})

countParseSchema = z.object({
  date: z.string().regex(DATE_ONLY_PATTERN),
  locations: z.array(locationBlockSchema).min(1),
  // opcional: refinements — exigir exatamente os dois locais? ou permitir um só?
})
```

### 3.2 O que o LLM **não** deve fazer

- Não multiplicar por 20/2.
- Não somar Mezanino+Cozinha.
- Não fundir “PCT CHICKEN” + “CHICKEN SESSÃO” numa linha só (código faz isso depois).
- Preferível: devolver `unitKind` explícito em vez de deixar `"PCT"` grudado no `supply` (evita o bug atual do lookup).

### 3.3 Camada de domínio pós-Zod (código)

1. Normalizar `supplyRaw` → `Supply.code` (aliases: `CHICKEN SESSÃO` → `CHICKEN`, strip `PCT`/`CX` do nome se ainda vierem misturados).
2. Se `unitKind === "package"`: `units = quantity * factor(code)`; se fator ausente → política da pergunta 0.4.
3. Se `unitKind === "unit"`: `units = quantity`.
4. Agregar por `(location, code)`, depois por `code` (soma dos locais).
5. Produzir `AggregatedCountItem[]` usado por `processCountItem` / confirmação / persistência:
   `{ supplyCode, reportedValue, locationBreakdown, actualQuantity? }`.

### 3.4 `awaiting_ingestion_count.items`

Hoje o JSONB espelha `CountItem` flat. Precisa versionar o shape (guardar já o agregado pós-conversão **ou** o bruto aninhado).  

**Proposta para discutir:** persistir o **agregado pós-conversão** no awaiting (mesmo shape que vai para `Count`), e manter o `rawText` como fonte de verdade do bruto — evita reaplicar fator em resume e evita migration complexa de JSON antigo (tabela provavelmente vazia em staging; se houver rows, decidir: dropar awaiting pendente vs migrar).

---

## 4. Onde gravar fatores de conversão (PCT→unidade na contagem)

**Não usar `unitsPerBox`.** Nome e semântica = B5 (caixa de NF-e).

| Opção | Onde | Prós | Contras |
|---|---|---|---|
| **F1 — Constante no código** (`COUNT_PACKAGE_TO_UNIT: Map<code, number>`) | ex. `src/domain/countPackageFactors.ts` | Explícito, versionado em PR, impossível “alguém mudou no banco sem review”; alinhado a `productMap` / `WASTE_SKU_MAP` | Mudar fator = deploy |
| **F2 — Nova coluna** `units_per_count_package` (nome distinto de `units_per_box`) em `Supply` | DB | Editável por seed/admin sem redeploy; por loja se um dia divergir | Migration + seed; risco de confundir com B5 se mal nomeada; baseline de supplies precisa backfill |
| **F3 — Reusar `defaultPackageQuantity`** | Coluna já existe, hoje sempre `null` | Sem coluna nova | Nome histórico D5 (“padrão do pacote”) conflita com “fator aproximado de contagem”; semântica misturada com override pontual |

**Proposta para discussão:** **F1** no MVP (fatores ×20 / ×2 são decisão de negócio explícita e estável o bastante para código), com comentário apontando o viés conhecido do Chicken. Se no futuro o fator mudar com frequência operacional, promover para F2 com nome inequívoco.

---

## 5. Mensagem de confirmação (D1) — opções

Hoje: lista flat `• G: 742`.

### Opção C1 — Dois blocos + total por insumo (recomendada para clareza)

```
Entendi (22/07/2026):

MEZANINO
• G: 857
• … 
• CHICKEN: 9 PCT → 180 un
• VEGETARIANO: 20 PCT → 40 un

COZINHA
• G: 160
• …
• CHICKEN: 8 PCT → 160 un + 6 sessão → 166 un
• VEGETARIANO: 5 un

TOTAIS (comparação)
• G: 1017
• CHICKEN: 346
• …

Confirma?
```

Mostra bruto **e** convertido onde houve PCT — colaborador valida o que o bot vai gravar.

### Opção C2 — Só totais agregados

Mais curto; esconde erro de local (857 no lugar errado) até a comparação falhar.

### Opção C3 — Só brutos por local, sem mostrar conversão

Colaborador confirma “9 PCT” sem ver “180”; risco de aceitar fator errado sem perceber.

**Pergunta ao Emanoel:** C1 vs C2 (e se a conversão PCT→un deve aparecer na confirmação).

---

## 6. Estratégia de migration (dado seed-manual existente)

Ordem sugerida (quando for implementar):

1. **Additive only:** `ALTER TABLE count ADD COLUMN location_breakdown jsonb NULL;` (ou criar tabela filha vazia, se S2).
2. **Não** alterar/nullificar `reported_value` das rows existentes.
3. **Não** exigir backfill de breakdown nas seed-manual.
4. Se nova coluna em `supply` (F2): `ADD … NULL` + update seed para Chicken=20, Vegetariano=2; outros `NULL`.
5. Atualizar tipo TS do JSONB em `awaiting_ingestion_count` no mesmo PR de parse — se houver awaiting em staging, documentar “descartar pendentes” (seguro: colaborador reenvia).
6. Testes: baseline ainda serve como `previousCount.reportedValue` para expected.

Rollback: dropar coluna nova; código antigo ignora breakdown.

---

## 7. Superfícies de código afetadas (mapa, sem implementar)

| Área | Mudança esperada |
|---|---|
| `llm/claudeClient.ts` + `geminiClient.ts` | Prompt + tool schema: locais, `unitKind`, aliases |
| `bot/parse.schema.ts` (+ tests) | Shape aninhado |
| Novo módulo domínio | Alias normalize + fatores + agregação |
| `bot/handlers/count.ts` | `formatSummary` multi-local |
| `domain/count.ts` / `countBatch.ts` | Consumir item já agregado |
| `persistence/schema.ts` + migration drizzle | Breakdown (e opcional coluna fator) |
| `awaitingIngestionCount` | Shape items |
| Seed comments / `Supply.unit` docs | Alinhar com unidade+pacote |
| Testes de fluxo bot | Fixture com mensagem real (sintética) |

**Não mexer:** `calculateExpectedValue`, adapters de venda/recebimento/desperdício, `unitsPerBox`.

---

## 8. Checklist de perguntas em aberto (revisão Emanoel)

Copiar/colar na conversa de review:

1. **D5:** sobrevive? Override só no total agregado, por local, ou aposentar no caminho feliz?
2. **Schema do breakdown:** S1 (JSONB nullable) vs S2 (tabela filha)?
3. **Fatores:** F1 (constante código) vs F2 (coluna nova com nome distinto de `unitsPerBox`)? (F3 reusar `defaultPackageQuantity` — desincentivada.)
4. **PCT sem fator** (ex. `PCT G`): erro / skip / outra política?
5. **D1:** C1 (locais + conversão + totais) vs C2 (só totais)?
6. **Locais incompletos:** mensagem só com Mezanino é válida, ou Zod exige os dois?
7. **Aliases canônicos:** lista fechada (`CHICKEN SESSÃO`, `CHORI`, …) no código — confirmar lista mínima a partir da mensagem real.
8. **`Supply.unit`:** atualizar seed para `unidade` nos que também contam soltos, ou deixar e documentar que a verdade está no `unitKind` da mensagem?

---

## 9. Critério de pronto *desta* tarefa de planejamento

- [x] Documento cobrindo schema + migration segura, parse Zod, fatores, D1, perguntas abertas.
- [x] Inconsistências com o código atual explicitadas (§0) em vez de forçar encaixe.
- [ ] Revisão humana (Emanoel) respondendo §8.
- [ ] Só depois: PR de implementação (escopo fechado, sem misturar com B6/XLSX etc.).

---

## 10. Fora deste plano

- Tolerância na comparação Chicken/Vegetariano (já decidido: não).
- Contagem por local na comparação / expected.
- Motor de pedido / outras categorias.
- Qualquer código de produção nesta rodada.
