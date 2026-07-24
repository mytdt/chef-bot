/**
 * Status: decisões da §12 FECHADAS com o Emanoel (2026-07-23) — implementação na
 * branch `feature/aceitar-routine-check`. Este arquivo permanece como registro do
 * desenho; a checklist §12 está resolvida (G2, aceite no envelope, /aceitar C1,
 * baseline matched|accepted, confirmed_by, números na resposta de aceite).
 */

---

## 0. Inconsistências com o código / docs atuais (parar e alinhar)

Estas não são “detalhes” — são tensões reais. **Não encaixar à força.**

### 0.1 Contagem às cegas vs alerta com números (já revogado em produção)

| Docs ainda dizem | Código / decisão recente |
|---|---|
| `CLAUDE.md` / `SPEC.md` §6.2: `valor_esperado` **nunca** aparece em mensagem Telegram | PR #25: alerta consolidado do **grupo** mostra informado / esperado / diferença (decisão explícita do Emanoel) |
| SPEC §4.4 Contagem ainda descreve “nunca exposto ao colaborador” | Resposta imediata pós-confirmação ainda só cita nomes; o grupo já vê números |

**Impacto neste plano:** `/aceitar` e a mensagem de divergência vão conviver com números no grupo. Qualquer texto do comando (“aceitar F com esperado 380?”) precisa decidir se repete esses números no chat (já público no grupo) ou só cita o insumo.

Não bloqueia o desenho de schema, mas **docs (CLAUDE/SPEC) estão desatualizados** e confundem quem implementar.

### 0.2 Quem “confirmou” o D1 não é persistido

Hoje:

- `Count.collaboratorTelegramId` = quem **enviou** a mensagem de contagem (`handlers/count.ts` → `pendingCounts`).
- O clique em “✅ Confirmar” (`handlers/confirmation.ts`) usa esse id salvo; **não grava** `ctx.from` de quem apertou o botão.

Consequência: “quem enviou” ≠ “quem confirmou o parse” ≠ “quem vai aceitar a divergência” já são três papéis possíveis, e só o primeiro existe no banco.

**Impacto:** campos `accepted_by_telegram_id` / `accepted_at` são novos e bem definidos; mas **não existe** hoje um `confirmed_by_telegram_id`. O plano precisa decidir se:

- **H1:** Aceite só documenta aceitador; confirmante D1 continua implícito / não auditado (status quo).
- **H2:** Nesta mesma entrega, passa a gravar quem clicou Confirmar (primeiro `UPDATE` real em Count, ou campo na inserção se o fluxo mudar).

### 0.3 Imutabilidade de `Count` vs aceite

Regra de negócio (SPEC / CLAUDE): contagem é imutável — `texto_bruto` nunca sobrescrito; toda contagem gera **novo** registro. Hoje o código só faz `INSERT` em `count` (confirmação D1 não faz update).

Aceitar uma divergência **não é uma contagem nova**: é um ato sobre um registro `matched=false` já existente.

**Tensão:** update pontual (`accepted_*`) vs criar linha nova de “evento de aceite”.

### 0.4 PR #27 (baseline só `matched=true`) — interação obrigatória

`findLastConfirmedBySupply` hoje:

```ts
confirmedByCollaborator = true AND matched = true
```

Uma divergência **aceita** precisa voltar a ser baseline **sem** reabrir o bug do chase (recontagem usando o valor da tentativa falha como esperado).

Regra necessária (intuição já confirmada pelo Emanoel):

```
baseline = confirmed AND (matched OR accepted)
```

Uma contagem `matched=false` e `accepted=false` **continua fora** da baseline.

### 0.5 `Alert` e outros FKs apontam para `count`

- `alert.count_id → count.id`
- `awaiting_ingestion_count` guarda items agregados (não é FK de count, mas é paralelo ao fluxo)
- Seed baseline / testes / integração assumem tabela `count`

Qualquer “substituir Count” arrasta migration desses vínculos. Qualquer “tabela envelope nova” precisa dizer o que acontece com `Alert`.

### 0.6 Visão genérica já existe em `Routine`, não em histórico

- `routine.verification_type` já é enum: `expected_numeric | binary | value_range | expiration | photo_evidence`.
- O **histórico** (resultado de uma execução) hoje é só `count`, modelado 100% para numérico esperado (reported/expected/matched/locationBreakdown).
- Não há `plano_projeto_bot_rotinas.md` no repo; a referência viva é `SPEC.md` §4.3–4.4.

### 0.7 O que *não* está inconsistente

- Aceite **não** é automático via `motivo` (parse) — alinhado; `motivo` hoje é parseado e **não persistido**.
- Aceite por qualquer membro do grupo (D9), sem admin — alinhado com `/ping` / contagem; só `/ingest_xml` e `/llm_check` são admin.
- Fórmula do esperado e comparação exata não mudam por este plano.
- Seed baseline já grava `matched=true` → continua baseline sem precisar de `accepted`.

---

## 1. Modelo mental: o que o `/aceitar` faz no domínio

```
Contagem confirmada (D1) → matched=false → alerta no grupo
    → colaborador pode:
         (a) recontar (novo Count; baseline ainda é a última matched/accepted)
         (b) /aceitar  → marca aquela contagem mismatch como estoque real aceito
                        → ela passa a ser baseline da próxima vez
```

Efeito no cálculo seguinte (mesmo insumo, sem movimentos novos):

| Situação | Baseline usada | Esperado na próxima |
|---|---|---|
| Última matched=330; mismatch 300 não aceito | 330 | 330 (+ movimentos) |
| Mesmo mismatch 300 **aceito** | 300 | 300 (+ movimentos) |
| Recontagem 330 sem aceitar o 300 (PR #27) | 330 | 330 |

É exatamente o que o caso F (−1 sem causa) precisa: “este é o estoque real agora”.

---

## 2. Forma da tabela genérica — opções

### 2.1 Opção G1 — Substituir `count` por `routine_check` (uma tabela só)

Renomear/migrar `count` → `routine_check` (ou nome similar), com colunas genéricas + colunas/JSONB específicas do tipo numérico.

```
routine_check (
  id, routine_id, store_id?, supply_id nullable,
  check_type  -- denormalizado do Routine.verificationType ou literal
  collaborator_telegram_id,   -- quem originou o check
  raw_text,
  outcome jsonb,              -- shape por tipo
  -- OU colunas tipadas nullable para expected_numeric:
  reported_value, expected_value, matched, actual_quantity_reported,
  location_breakdown,
  confirmed_by_collaborator,
  accepted, accepted_by_telegram_id, accepted_at,
  llm_used, created_at
)
```

| Prós | Contras |
|---|---|
| Um único histórico de “execução de rotina” | Migration pesada: rename + FKs (`alert`, seeds, todos os repos/testes) |
| Alinha com a visão SPEC de Rotina multi-tipo | Força nullable em campos que só fazem sentido para numérico |
| Aceite e match vivem no mesmo registro do check | Risco de over-modelar `outcome` jsonb cedo demais |

### 2.2 Opção G2 — Envelope `routine_check` + manter `count` como detalhe tipado (recomendada para discutir primeiro)

Tabela nova = evento genérico; `count` continua sendo o payload de `expected_numeric`, **1:1** com o check.

```
routine_check (
  id uuid PK,
  routine_id uuid NOT NULL → routine,
  store_id uuid NOT NULL → store,          -- denormalizado pra listar por loja
  supply_id uuid NULL → supply,            -- null em rotinas futuras sem insumo
  verification_type enum NOT NULL,         -- snapshot do tipo no momento do check
  status enum NOT NULL,                   -- ver §4
  collaborator_telegram_id text NOT NULL, -- quem originou
  confirmed_by_telegram_id text NULL,     -- opcional; ver 0.2
  accepted_by_telegram_id text NULL,
  accepted_at timestamptz NULL,
  raw_text text NOT NULL,
  llm_used ...,
  payload jsonb NULL,                     -- placeholder para tipos futuros
  created_at timestamptz NOT NULL
)

count (
  ...campos atuais...
  routine_check_id uuid UNIQUE NOT NULL → routine_check  -- NOVO
  -- + campos de aceite? ver discussão: no envelope OU no count
)
```

Fluxo numérico: cria `routine_check` + `count` na mesma transação (como hoje um insert de count).

| Prós | Contras |
|---|---|
| Migration **aditiva**: `count` existente ganha FK nullable→backfill→NOT NULL | Duas tabelas para ler “histórico de contagem” (join) |
| Tipos futuros não poluem colunas de carne | Precisa disciplina: nunca criar `count` sem `routine_check` |
| `Alert` pode migrar FK para `routine_check` **depois**, ou continuar em `count` no MVP do aceite | Um pouco mais de código no insert path |
| Aceite pode viver no envelope (genérico: “este check foi aceito”) | |

**Backfill:** para cada `count` existente, inserir `routine_check` espelhando `routine_id`, `supply_id`, `collaborator_telegram_id`, `raw_text`, `created_at`, `verification_type='expected_numeric'`, `status` derivado de `matched` / futuro `accepted`.

### 2.3 Opção G3 — Não generalizar tabela agora; só campos de aceite em `count`

Adiciona `accepted` / `accepted_by` / `accepted_at` em `count` e muda a query de baseline. “Generalização” fica só como comentário / rename cosmético depois.

| Prós | Contras |
|---|---|
| Menor diff, entrega `/aceitar` rápido | **Contradiz** a decisão confirmada: generalizar **agora**, junto com o comando |
| Zero risco de envelope pela metade | Empurra a dívida que o Emanoel quer pagar nesta leva |

**G3 fica como baseline de custo**, não como recomendação — a decisão de negócio já pediu generalizar agora.

### 2.4 Recomendação (proposta, não decisão final)

**G2 (envelope + count tipado)** — migration aditiva, preserva histórico e testes, dá lugar genérico para aceite/`status` sem forçar jsonb de temperatura/foto hoje.

Se a prioridade absoluta for “menos arquivos tocados”, G1 rename-in-place é aceitável, mas o custo de PR/review e risco de regressão sobem sem ganho de produto no MVP de carne.

---

## 3. Onde vivem os campos de aceite

### 3.1 Opção A — No envelope `routine_check` (combinam bem com G2)

`accepted_by_telegram_id`, `accepted_at`, e um flag/`status` no check genérico.

- Aceite é ato sobre o **check**, não sobre a matemática do count.
- Tipos futuros (binária falhou → aceitar exceção) reutilizam os mesmos campos.

### 3.2 Opção B — Em `count`

Mais simples se G3 ou se baseline continua lendo só `count`.

### 3.3 Opção C — Tabela `count_acceptance` (append-only)

Respeita imutabilidade estrita de `count`: nenhum UPDATE. Baseline faz join/exists.

| Prós | Contras |
|---|---|
| Audit trail puro, sem update | Query de baseline mais chata; fácil esquecer o join |
| | Mais uma tabela para um flag essencialmente booleano write-once |

### 3.4 Recomendação

Com **G2**: campos de aceite no **`routine_check`** (A), e a query de baseline passa a considerar count cujo check está `accepted` **ou** `count.matched`.

Alternativa enxuta se G2 parecer pesado demais na prática: aceite em `count` (B) + envelope mínimo só com ids/tipo/status — mas aí metade do valor do envelope some.

**Imutabilidade:** tratar `accepted_*` como **write-once** (NULL → preenchido uma vez; segundo `/aceitar` no mesmo check = erro “já aceito”). Não reescreve `raw_text` / valores. É o mesmo espírito de “não sobrescrever contagem”, com exceção auditável de status — documentar explicitamente na SPEC se aprovado.

---

## 4. Status do check (enum mínimo)

Evitar booleans contraditórios (`matched=true` e `accepted=true` ao mesmo tempo).

Proposta de `routine_check.status` (ou campos derivados):

| status | Significado |
|---|---|
| `matched` | Bateu na comparação |
| `mismatched` | Não bateu; ainda aberta (pode recontar ou aceitar) |
| `accepted` | Não bateu, mas divergência aceita como estoque real |
| `invalid` / `skipped` | (opcional depois) qtd inválida / insumo não encontrado — hoje nem sempre viram Count |

Hoje só existem rows para itens que passaram validação e foram inseridos. Manter `count.matched` boolean **e** espelhar status no envelope (ou dropar boolean depois). Na implementação, preferir **uma fonte da verdade** para baseline:

```
eligible_as_baseline =
  confirmed
  AND (matched OR status = 'accepted' OR accepted_at IS NOT NULL)
```

---

## 5. Como `/aceitar` identifica a contagem

### 5.1 Opção C1 — `/aceitar <código ou nome>` → última mismatch não aceita daquele insumo

Ex.: `/aceitar F`, `/aceitar Burger de 90g` (mesmo lookup que movimentos manuais usam para nome; código como na contagem).

| Prós | Contras |
|---|---|
| Cabe na cabeça do colaborador | Ambíguo se houver **duas** mismatches antigas não aceitas (raro se só a última importa) |
| Implementação direta | Precisa regra: “última por `created_at` com matched=false e não accepted” |

### 5.2 Opção C2 — Sem argumentos: lista mismatches recentes + botões

Bot responde com inline keyboard “Aceitar F (−1)”, “Aceitar W (−30)”.

| Prós | Contras |
|---|---|
| Zero ambiguidade de id | Mais UX/Telegram; precisa TTL / “já processado” |
| Bom quando o alerta listou vários insumos | |

### 5.3 Opção C3 — Botão no próprio alerta consolidado

Cada linha do alerta (ou um botão por insumo) já carrega `count_id` / `routine_check_id`.

| Prós | Contras |
|---|---|
| Menor atrito no momento da divergência | Alerta atual é texto puro (`@all`); mudar formato / reply_markup |
| Id estável | Quem lê o alerta depois de horas ainda tem o botão? (mensagem antiga) |

### 5.4 Opção C4 — `/aceitar` só com id opaco

Ruim para operação humana — descartada.

### 5.5 Recomendação

**C1 agora** (comando explícito, decisão já pedida), com regra: aceita a **última** contagem confirmada `matched=false` e ainda não aceita daquele supply na loja ativa.

**C3 como follow-up barato** (botões no alerta) sem substituir o comando — atalho, não única porta.

Pergunta aberta: se não houver mismatch pendente → responder “nada para aceitar em F” (não criar aceite do nada).

---

## 6. Papéis de pessoa (telegram ids)

| Papel | Campo | Existe hoje? |
|---|---|---|
| Quem enviou a contagem | `collaborator_telegram_id` | Sim |
| Quem confirmou o parse D1 | `confirmed_by_telegram_id`? | **Não** ( lacuna 0.2 ) |
| Quem aceitou a divergência | `accepted_by_telegram_id` + `accepted_at` | Não — criar |

Decisões de negócio já fechadas: aceite **não** exige admin; qualquer um no grupo (D9).

**Pergunta aberta:** pode aceitar quem **não** foi o autor da contagem? (Ex.: Emanoel aceita o −1 do F que o turno contou.)  
Recomendação: **sim** — alinhado a “qualquer colaborador autorizado”; gravar o aceitador real em `accepted_by_*`.

---

## 7. Baseline após aceite (não reabrir PR #27)

### 7.1 Query alvo

Pseudocódigo (nome da função pode continuar `findLastConfirmedBySupply` ou virar `findLastBaselineBySupply`):

```
WHERE supply_id = ?
  AND confirmed_by_collaborator = true
  AND (
    matched = true
    OR accepted_at IS NOT NULL   -- / accepted = true / status = 'accepted'
  )
ORDER BY created_at DESC
LIMIT 1
```

### 7.2 Invariantes de teste (obrigatórios na implementação)

1. Mismatch não aceito **não** vira baseline (regressão PR #27 / Wagyu 300→330).
2. Mismatch aceito **vira** baseline (caso F −1).
3. Seed `matched=true` continua baseline sem `accepted`.
4. Aceitar duas vezes o mesmo check falha de forma clara.
5. Recontagem após mismatch não aceito ainda usa a matched anterior.

### 7.3 Valor efetivo da baseline aceita

Usar o mesmo `effectiveValue` de hoje (`actualQuantityReported ?? reportedValue`) da contagem aceita — o estoque real declarado/aceito é o informado naquela tentativa, não o `expectedValue` antigo.

---

## 8. Schema flexível para tipos futuros (sem implementá-los)

### 8.1 Campos mínimos **hoje** (carne / expected_numeric)

No envelope (G2): ids, tipo, status, autores, raw_text, timestamps, llm_used.  
No `count`: manter colunas numéricas atuais + FK ao envelope.

### 8.2 Placeholder para o resto

- `routine_check.payload jsonb NULL` — vazio no MVP de carne; futuro: `{ "binaryOk": false }`, faixa, URL de foto, etc.
- **Não** criar tabelas `binary_check` / `photo_check` agora.
- `supply_id` nullable no envelope (rotina de limpeza pode não ter insumo).

### 8.3 O que *não* fazer agora

- Não modelar workflows de validade/foto.
- Não unificar `InventoryMovement` com routine_check.
- Não migrar `Alert` para polimorfismo multi-tipo na mesma PR, a menos que o envelope obrigue — pode continuar `alert.count_id` no primeiro corte.

---

## 9. Migration segura (dado real + seed + testes)

### 9.1 Princípios (iguais ao plano Mezanino)

1. **Aditivo primeiro** — criar tabelas/colunas nullable; não dropar `count`.
2. **Backfill** determinístico dos rows existentes (incluindo `collaborator_telegram_id = 'seed-manual'`).
3. **Depois** NOT NULL / UNIQUE onde couber.
4. Nunca apagar histórico de teste/staging.

### 9.2 Sequência sugerida (G2 + aceite)

1. Criar `routine_check` (+ enums `status` se houver).
2. Adicionar `count.routine_check_id` nullable.
3. Backfill: 1 `routine_check` por `count`; ligar FK; `status = matched ? 'matched' : 'mismatched'`; `accepted_*` null.
4. Tornar `routine_check_id` NOT NULL + UNIQUE.
5. Adicionar colunas de aceite (no envelope ou em count — conforme §3).
6. Alterar `findLastConfirmedBySupply` (ou equivalente) para `matched OR accepted`.
7. Registrar comando `/aceitar` (underscore, não hífen — lição 2026-07-23).
8. Testes de regressão §7.2 + seed baseline.

### 9.3 Rollback

Colunas/tabelas novas podem ficar; feature flag não é necessária se `/aceitar` for o único writer de `accepted_*`. Reverter app sem usar o comando deixa o schema inerte.

---

## 10. Superfície do bot (esboço, não implementação)

```
/aceitar F
→ resolve supply
→ busca última count/check mismatch não aceita
→ marca aceite (write-once)
→ responde no grupo: "Divergência de F aceita (informado X). Passa a valer como estoque."
→ (opcional) mencionar diferença / esperado — ver pergunta docs 0.1
```

Permissão: só middleware D9 do grupo (como `/ping`), **sem** `createAdminMiddleware`.

Ordem de registro: `bot.command("aceitar", …)` **antes** do catch-all de contagem (`registerHandlers`).

---

## 11. Escopo explícito fora / dentro

**Dentro (quando implementar, após §12):**

- Schema envelope (ou decisão G1) + campos de aceite
- Baseline query
- `/aceitar` + testes
- Ajuste mínimo de docs (CLAUDE/SPEC) sobre cegas vs grupo e sobre aceite

**Fora:**

- Aceite automático por `motivo`
- Novos tipos de rotina (binária, foto, …) além do placeholder
- Dashboard / KPIs
- Admin-only accept
- Mudança da fórmula do esperado

---

## 12. Decisões pendentes (checklist para o Emanoel)

Responda na thread / PR deste plano; implementação só depois.
*Status do cabeçalho: “fechar as decisões da §12” (não §8 — a §8 deste arquivo é schema flexível).*

### Forma da tabela

- [ ] **G1** substituir/renomear `count` → tabela genérica única  
- [x] **G2** envelope `routine_check` + `count` tipado (recomendado) ✅ fechado  
- [ ] **G3** só aceite em `count`, generalização depois (contra decisão “agora”, só se reabrir escopo)

### Onde fica o aceite

- [x] **A** campos no envelope ✅ fechado  
- [ ] **B** campos em `count`  
- [ ] **C** tabela append-only de aceite  

### Como identifica o alvo do `/aceitar`

- [x] **C1** `/aceitar <código|nome>` → última mismatch não aceita (recomendado) ✅ fechado  
- [ ] **C2** lista + botões  
- [ ] **C3** botões no alerta (além do comando?) — fora desta entrega (§11)  
- [ ] Mistura: C1 agora + C3 depois  

### Papéis / auditoria

- [x] Aceitador pode ser ≠ autor da contagem? (**sim**) ✅  
- [x] Gravar confirmante D1 nesta entrega (**H2**) ✅  

### Imutabilidade

- [x] Update write-once de `accepted_*` no mesmo registro (rec. com G2/A ou B) ✅  
- [ ] Append-only (opção C)  

### Mensagem de aceite e números

- [x] Resposta do `/aceitar` cita informado/esperado/diferença (já públicos no grupo) ✅  
- [ ] Só nome do insumo + “aceito como estoque”  

### Nome da tabela envelope

- [x] `routine_check` ✅  
- [ ] `routine_execution`  
- [ ] `routine_history`  
- [ ] outro: ________  

---

## 13. Ordem sugerida de implementação (após fechar §12)

1. Migration aditiva + backfill (sem comando ainda) — baseline query ainda só `matched` até o passo 2.  
2. Baseline `matched OR accepted` + testes de regressão (incluindo PR #27).  
3. `/aceitar` + logs (padrão observabilidade).  
4. Atualizar SPEC/CLAUDE (cegas parcial + aceite + envelope).  
5. (Opcional) botões no alerta consolidado.

---

## 14. Recorte se o plano “juntar tudo” ficar grande demais

Se na revisão o envelope G2 ameaçar um PR monstro, **não** voltar a G3 sem acordo — em vez disso fatiar PRs:

1. `feat: routine_check envelope + backfill` (sem comportamento novo)  
2. `feat: /aceitar + baseline matched|accepted`  

Ainda cumpre “generalizar agora”, só com merge em dois passos. Confirmar se isso é aceitável.
