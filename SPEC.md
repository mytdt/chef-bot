# SPEC.md — MVP: Bot de Contagem de Carne (Bom Beef, loja 0032)

> Spec técnica derivada de `plano_projeto_bot_rotinas.md`. Serve de referência para implementação via Claude Code.
> Status: v1 — decisões D1 a D5 (seção 5) confirmadas pelo humano em 2026-07-17. Pronta para implementação.

---

## 1. Objetivo do MVP (Milestone 1)

Automatizar de ponta a ponta o fluxo de contagem de carne que hoje é manual (WhatsApp + planilha), para a categoria **Burgers** apenas:

1. Colaborador envia a contagem via Telegram, em texto livre, no formato que já usa hoje (ex.: `742 G / 689 F / 380 W / 9 PCT CHICKEN`).
2. Sistema interpreta o texto (via LLM), estrutura em JSON e **confirma com o colaborador antes de prosseguir** (ver decisão D1).
3. Sistema calcula o valor esperado: `Esperado = Recebimento + Contagem Anterior − Vendas − Desperdício`.
4. Sistema compara contagem informada vs. esperado, **sem revelar o valor esperado ao colaborador** (contagem às cegas).
5. Se bater: bot responde confirmando "tudo certo", sem alarme.
6. Se não bater: bot alerta o grupo (`@all`) e monitora reconhecimento (ver decisão D2).

## 2. Fora de escopo (não implementar nesta fase)

- Motor de sugestão de pedido de compra (aba "Wessel" da planilha).
- Categorias além de Burgers (Queijos, Molhos, Batata, Flavors House) — schema deve suportar, mas não implementar fluxo para elas.
- Dashboard executivo / KPIs em tempo real.
- Integração oficial via API do 3SCheckout — usar entrada manual de dados de venda (interface simples, a definir).
- Terraform / infraestrutura multi-loja.
- Demais rotinas da Ficha de Rotina Operacional (abertura, limpeza, temperatura, validade).

## 3. Stack e arquitetura

- **Runtime:** Node.js + TypeScript (strict mode).
- **Bot:** Telegraf (lib já usada pelo Emanoel).
- **Validação de entrada:** Zod para todos os payloads estruturados.
- **Persistência:** Postgres via Docker (D3 — confirmado).
- **Deploy:** Docker + docker-compose, portável (Railway/Vercel/etc.). Sem Terraform nesta fase.
- **Segredos:** variáveis de ambiente (`.env`, nunca commitado — incluir no `.gitignore`).
- **Interpretação de texto livre:** chamada a um modelo de linguagem (Claude via API) que recebe o texto do colaborador e retorna JSON estruturado, validado por um schema Zod antes de seguir para comparação.

## 4. Modelo de domínio

### 4.1 Entidade `Loja`
D4 (confirmado): incluir esta entidade desde o MVP, mesmo operando com uma loja só, para não exigir migração de schema quando o produto virar SaaS multi-franquia.

```
Loja {
  id: string (uuid)
  nome: string           // ex: "Bom Beef 0032"
  telegram_group_id: string
  ativa: boolean
}
```

### 4.2 Entidade `Insumo`
```
Insumo {
  id: string (uuid)
  loja_id: string (FK -> Loja)
  categoria: enum ["burger", "queijo", "molho", "batata", "flavors_house"]  // MVP só usa "burger"
  nome: string             // ex: "Burger 90g", "Chicken", "Vegetariano"
  unidade: string           // ex: "unidade", "pacote", "kg"
  quantidade_padrao_por_pacote: number | null   // null quando variável (ex: Chicken, Vegetariano)
  ativo: boolean
}
```

### 4.3 Entidade `Rotina`
Modelagem genérica pensada para suportar os 5 tipos de verificação identificados no plano, mesmo que o MVP só implemente o tipo "numérica com valor esperado".

```
Rotina {
  id: string (uuid)
  loja_id: string (FK -> Loja)
  nome: string                         // ex: "Contagem de Carne"
  tipo_verificacao: enum ["numerica_esperada", "binaria", "faixa_valor", "validade", "foto_evidencia"]
  frequencia: enum ["diaria", "a_cada_n_dias", "semanal", "mensal"]
  criticidade: enum ["baixa", "media", "alta"]
  ativa: boolean
}
```

### 4.4 Entidade `Contagem` + envelope `routine_check`

Histórico genérico de execução de rotina: `routine_check` (envelope). Contagem de carne é o payload tipado `count` (1:1 via `count.routine_check_id`).

```
RoutineCheck {
  id: string (uuid)
  routine_id, store_id, supply_id (nullable em rotinas futuras sem insumo)
  verification_type: enum (snapshot)
  status: enum ["matched", "mismatched", "accepted"]
  collaborator_telegram_id: string      // quem enviou a mensagem
  confirmed_by_telegram_id: string | null  // quem clicou Confirmar (D1)
  accepted_by_telegram_id / accepted_at    // /aceitar — write-once
  raw_text, llm_used, payload jsonb?, created_at
}

Contagem {
  id: string (uuid)
  routine_check_id: string (FK -> RoutineCheck, unique)
  rotina_id, insumo_id, collaborator_telegram_id, texto_bruto
  valor_informado, quantidade_real_informada, location_breakdown?
  valor_esperado, bateu, confirmado_pelo_colaborador, criado_em
}
```

Baseline do próximo esperado: última Contagem confirmada com `bateu=true` **ou** RoutineCheck com `accepted_at` preenchido.

### 4.5 Entidade `Alerta`
```
Alerta {
  id: string (uuid)
  contagem_id: string (FK -> Contagem)
  enviado_em: datetime
}
```
(C6: sem reconhecimento/escalonamento — amendido; D2 original aposentado.)

### 4.6 Entidade `HistoricoMovimento` (Recebimento / Venda / Desperdício)
Necessária para calcular `valor_esperado`. Substitui as abas "Histórico de Saída" da planilha.

```
HistoricoMovimento {
  id: string (uuid)
  insumo_id: string (FK -> Insumo)
  tipo: enum ["recebimento", "venda", "desperdicio"]
  quantidade: number
  origem: enum ["manual", "3scheckout_api"]   // manual no MVP; api reservado para Plano A futuro
  registrado_em: datetime
}
```

## 5. Decisões confirmadas pelo humano (2026-07-17)

| # | Decisão | Confirmado para o MVP |
|---|---|---|
| D1 | Parse via LLM do texto livre precisa de confirmação explícita do colaborador ("Entendi: 742 G, 689 F... Confirma?") antes de rodar a comparação, para evitar erro silencioso na feature mais crítica. | ✅ Bot sempre confirma antes de comparar. |
| D2 | Alerta ao grupo tem um estado de reconhecimento; se ninguém reagir em 15 minutos, escala via DM para um responsável designado. | ✅ Campo `reconhecido` + escalonamento simples por timeout de 15 min. |
| D3 | Banco de dados relacional (Postgres). | ✅ Postgres via Docker. |
| D4 | Entidade `Loja` existe desde o MVP, mesmo com uma loja só. | ✅ Incluída desde já. |
| D5 | Pacotes de quantidade variável (Chicken, Vegetariano): colaborador informa a quantidade real ao abrir o pacote; isso vale **só para aquela contagem**, não altera o padrão do Insumo. | ✅ Campo `quantidade_real_informada` pontual. |

Todas as 5 decisões confirmadas nas opções originalmente assumidas — sem ajustes.

## 6. Regras de negócio centrais

1. `valor_esperado = recebimento + contagem_anterior − vendas − desperdicio`, calculado por Insumo, com base nos registros de `HistoricoMovimento` desde a última contagem **elegível como baseline** (matched ou aceita).
2. O `valor_esperado` aparece no **alerta consolidado do grupo** e na resposta de `/aceitar` (amendido 2026-07-23; a regra antiga de “nunca expor” foi revogada nesses canais). Não espalhar esperado em outros fluxos sem decisão explícita.
3. Toda contagem gera um registro imutável de valores (`texto_bruto` preservado) — nunca sobrescrever valores; aceite só preenche `accepted_*` no envelope (write-once).
4. Bot só processa mensagens do grupo configurado da loja (D9 — `store.telegram_group_id`).
5. `/aceitar <código|nome>`: qualquer membro do grupo pode aceitar a última divergência não aceita daquele insumo como estoque real (sem permissão de admin).

## 7. Arquivos e módulos principais (sugestão de estrutura)

```
src/
  bot/
    telegram.ts          // setup do Telegraf, handlers de mensagem
    parse.ts             // chamada ao LLM + validação Zod do JSON estruturado
    confirmacao.ts        // fluxo de confirmação (D1)
  dominio/
    rotina.ts
    insumo.ts
    contagem.ts
    alerta.ts
  calculo/
    esperado.ts           // fórmula de valor esperado
  persistencia/
    db.ts                 // conexão Postgres
    migrations/           // scripts de migração do schema
    seed-historico.ts      // migração dos dados históricos da planilha
  alertas/
    escalonamento.ts       // timeout + escalonamento (D2)
docs/
  ficha-rotina-operacional.md   // referência (se disponível)
CLAUDE.md
SPEC.md
```

## 8. Critério de verificação end-to-end (definição de "pronto")

O MVP está pronto quando, em ambiente de teste (grupo de Telegram de staging):

1. Um colaborador de teste envia uma contagem no formato real (ex.: `742 G / 689 F / 380 W`).
2. O bot responde com o parse estruturado e aguarda confirmação.
3. Após confirmação, o sistema calcula o esperado e:
   - Se os valores de teste foram configurados para bater → bot responde "tudo certo" (sem revelar números).
   - Se os valores foram configurados para não bater → bot posta alerta no grupo e, após o timeout configurado sem reconhecimento, dispara escalonamento (verificável nos logs/DB).
4. O registro da contagem existe no banco com `texto_bruto` preservado e `valor_esperado` calculado corretamente (conferir manualmente contra o cálculo da planilha atual para os mesmos dados de entrada).
5. Testes automatizados cobrem: cálculo do esperado (casos normais + pacote de quantidade variável), validação Zod do parse do LLM (casos válidos e malformados), e o fluxo de decisão bate/não-bate.

## 9. Rollout sugerido (não bloqueante para o spec, mas recomendado)

Rodar o novo cálculo em modo *shadow* (paralelo à planilha atual) por 1–2 semanas antes de desligar o processo manual, comparando os valores calculados pelos dois sistemas para os mesmos dados de entrada.
