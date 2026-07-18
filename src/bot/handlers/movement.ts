import type { Context, Telegraf } from "telegraf";
import { z } from "zod";
import type { Db } from "src/persistence/db.js";
import * as supplyRepo from "src/persistence/repositories/supplyRepo.js";
import * as inventoryMovementRepo from "src/persistence/repositories/inventoryMovementRepo.js";
import * as storeRepo from "src/persistence/repositories/storeRepo.js";
import { isValidQuantity } from "src/domain/quantityRules.js";
import type { MovementType } from "src/domain/types.js";

const argsSchema = z.object({
  quantity: z.number().finite().positive(),
  supplyName: z.string().min(1),
});

// Format: /command <supply name> <quantity> — last token is the quantity, everything
// before it (may contain spaces) is the supply name.
function parseArgs(commandText: string): { quantity: number; supplyName: string } | null {
  const parts = commandText.trim().split(/\s+/).slice(1);
  if (parts.length < 2) {
    return null;
  }

  const last = parts[parts.length - 1];
  const result = argsSchema.safeParse({
    quantity: Number(last),
    supplyName: parts.slice(0, -1).join(" "),
  });
  return result.success ? result.data : null;
}

// Display-only labels for bot replies — the team speaks Portuguese, the MovementType
// value stored in the database stays in English (it's code, not user-facing text).
const MOVEMENT_TYPE_LABELS_PT: Record<MovementType, string> = {
  receipt: "recebimento",
  sale: "venda",
  waste: "desperdício",
};

function registerMovementCommand(bot: Telegraf<Context>, db: Db, command: string, type: MovementType): void {
  bot.command(command, async (ctx) => {
    const args = parseArgs(ctx.message.text);
    if (!args) {
      await ctx.reply(`Formato inválido. Use: /${command} <nome do insumo> <quantidade>`);
      return;
    }

    const activeStore = await storeRepo.findActiveStore(db);
    if (!activeStore) {
      await ctx.reply("Nenhuma loja ativa configurada.");
      return;
    }

    const supplyFound = await supplyRepo.findByName(db, activeStore.id, args.supplyName);
    if (!supplyFound) {
      await ctx.reply(`Insumo "${args.supplyName}" não encontrado no cadastro.`);
      return;
    }

    if (!isValidQuantity(supplyFound.category, args.quantity)) {
      await ctx.reply(`Quantidade precisa ser um número inteiro para "${supplyFound.name}".`);
      return;
    }

    await inventoryMovementRepo.insert(db, {
      supplyId: supplyFound.id,
      type,
      quantity: args.quantity,
      source: "manual",
    });

    await ctx.reply(`Registrado: ${MOVEMENT_TYPE_LABELS_PT[type]} de ${args.quantity} para "${supplyFound.name}".`);
  });
}

export function registerMovementHandler(bot: Telegraf<Context>, db: Db): void {
  registerMovementCommand(bot, db, "recebimento", "receipt");
  registerMovementCommand(bot, db, "venda", "sale");
  registerMovementCommand(bot, db, "desperdicio", "waste");
}
