# CLAUDE.md — Bot de Rotinas Bom Beef

Contexto de projeto. Leia também `@SPEC.md` (fonte da verdade para o MVP em andamento) antes de implementar qualquer feature.

## O que é este projeto

API + bot de Telegram que automatiza rotinas operacionais de uma hamburgueria (Bom Beef, loja 0032). MVP atual: contagem de carne (categoria Burgers). Arquitetura pensada como fundação genérica + módulos ("Lego") — não hardcode nada específico de "carne" fora da camada de dados.

## Stack

- Node.js + TypeScript (strict mode) — sem `any` sem justificativa em comentário.
- Telegraf para o bot de Telegram.
- Zod para validar TODO payload estruturado, especialmente o JSON retornado pelo parse via LLM.
- Postgres (via Docker) para persistência.
- Docker + docker-compose para deploy local e produção.

## Comandos

```bash
npm run dev              # roda o bot localmente com hot reload
npm test                 # roda a suíte de testes
npm run migrate          # aplica migrações do banco
docker compose up -d     # sobe Postgres + serviço em containers
```

(Ajustar este bloco assim que os scripts reais existirem no `package.json` — este é um ponto de partida, não confirmado ainda.)

## Regras de negócio inegociáveis

- **Esperado no Telegram (amendido 2026-07-23):** o alerta consolidado no **grupo** e o comando `/aceitar` **mostram** informado / esperado / diferença (decisão explícita — revoga a regra antiga de “contagem às cegas” nesses canais). A resposta imediata pós-confirmação D1 ao colaborador ainda pode citar só nomes. Não reintroduzir esperado em mensagens que não forem alerta/aceite sem decisão humana.
- **Confirmação antes de comparar:** toda contagem parseada via LLM deve ser confirmada explicitamente pelo colaborador antes do sistema rodar a comparação. Nunca comparar direto no primeiro parse. Quem clicou Confirmar fica em `routine_check.confirmed_by_telegram_id`.
- **Imutabilidade da contagem:** `texto_bruto` da mensagem original nunca é sobrescrito. Toda contagem gera um novo registro (`count` + envelope `routine_check`). Exceção write-once: aceite de divergência preenche `accepted_*` no envelope.
- **Baseline do esperado:** última contagem confirmada com `matched=true` **ou** aceite (`accepted_at` preenchido). Mismatch não aceito não vira baseline (PR #27).
- **Fórmula do esperado é fixa:** `Esperado = Recebimento + Contagem Anterior − Vendas − Desperdício`. Já validada em produção via planilha/script — não alterar sem validação explícita do humano.

## Convenções

- ES modules, imports absolutos a partir de `src/`.
- Toda entrada externa (Telegram, LLM, API futura do 3SCheckout) passa por um schema Zod antes de tocar em lógica de negócio.
- Testes unitários obrigatórios para: cálculo do esperado, validação de parse (casos válidos e malformados), decisão bate/não-bate.
- Nomenclatura de branch: `feature/<nome-curto>`, `fix/<nome-curto>`.
- Commits descritivos, no formato `tipo: descrição` (ex.: `feat: parse de contagem via LLM`).

## Segredos

Nunca commitar tokens do bot, chaves de API ou credenciais de banco. Tudo via `.env` (já no `.gitignore`). Se encontrar um segredo hardcoded em qualquer arquivo, pare e avise antes de continuar.

## Decisões de arquitetura (ver SPEC.md seção 5)

Confirmadas pelo humano em 2026-07-17 — D1 a D5 todas fechadas nas opções recomendadas: confirmação explícita do parse via LLM antes de comparar, escalonamento de alerta por DM após 15 min sem reconhecimento, Postgres via Docker, entidade `Loja` desde o MVP, e `quantidade_real_informada` como override pontual (não altera o padrão do Insumo). Pode implementar sem reconfirmar.

## Fora de escopo do MVP (não implementar sem pedido explícito)

- Motor de sugestão de pedido de compra.
- Categorias além de Burgers.
- Dashboard/KPIs.
- Integração oficial com API do 3SCheckout.
- Terraform / infra multi-loja.
- Outras rotinas da Ficha de Rotina Operacional (abertura, limpeza, temperatura, validade).
