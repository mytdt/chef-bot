import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-5";

export function criarClaudeClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
}

const SYSTEM_PROMPT = `Você interpreta mensagens de contagem de estoque de uma hamburgueria (categoria Burgers),
enviadas em texto livre por um colaborador via Telegram. O formato varia, mas normalmente é uma lista de
"quantidade + código do insumo" separados por barra ou vírgula, ex.: "742 G / 689 F / 380 W / 9 PCT CHICKEN".

Extraia cada item da mensagem, preservando o código/nome do insumo exatamente como aparece no texto (não
traduza nem normalize). Se o colaborador mencionar explicitamente a quantidade real de um pacote de
quantidade variável (ex.: "abri o pacote de chicken e tinha 8.5"), preencha quantidadeReal para esse item;
caso contrário deixe null. Não invente itens que não estão no texto.`;

const PARSE_TOOL = {
  name: "registrar_itens_contagem",
  description: "Registra os itens estruturados extraídos da mensagem de contagem em texto livre.",
  input_schema: {
    type: "object",
    properties: {
      itens: {
        type: "array",
        items: {
          type: "object",
          properties: {
            insumo: {
              type: "string",
              description: "Código ou nome do insumo exatamente como aparece no texto (ex: G, F, W, PCT CHICKEN)",
            },
            quantidade: {
              type: "number",
              description: "Quantidade informada para esse insumo",
            },
            quantidadeReal: {
              type: ["number", "null"],
              description:
                "Quantidade real informada pelo colaborador ao abrir um pacote de quantidade variável, se mencionada explicitamente. null caso contrário.",
            },
          },
          required: ["insumo", "quantidade"],
        },
      },
    },
    required: ["itens"],
  },
} as const;

export async function parseTextoContagem(client: Anthropic, textoBruto: string): Promise<unknown> {
  const resposta = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [PARSE_TOOL],
    tool_choice: { type: "tool", name: PARSE_TOOL.name },
    messages: [{ role: "user", content: textoBruto }],
  });

  const blocoToolUse = resposta.content.find((bloco) => bloco.type === "tool_use");
  if (!blocoToolUse || blocoToolUse.type !== "tool_use") {
    throw new Error("O modelo não retornou uma chamada de ferramenta com o parse estruturado.");
  }
  return blocoToolUse.input;
}
