CREATE TYPE "public"."categoria_insumo" AS ENUM('burger', 'queijo', 'molho', 'batata', 'flavors_house');--> statement-breakpoint
CREATE TYPE "public"."criticidade" AS ENUM('baixa', 'media', 'alta');--> statement-breakpoint
CREATE TYPE "public"."frequencia" AS ENUM('diaria', 'a_cada_n_dias', 'semanal', 'mensal');--> statement-breakpoint
CREATE TYPE "public"."origem_movimento" AS ENUM('manual', '3scheckout_api');--> statement-breakpoint
CREATE TYPE "public"."tipo_movimento" AS ENUM('recebimento', 'venda', 'desperdicio');--> statement-breakpoint
CREATE TYPE "public"."tipo_verificacao" AS ENUM('numerica_esperada', 'binaria', 'faixa_valor', 'validade', 'foto_evidencia');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alerta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contagem_id" uuid NOT NULL,
	"enviado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"reconhecido" boolean DEFAULT false NOT NULL,
	"reconhecido_por" text,
	"reconhecido_em" timestamp with time zone,
	"escalonado" boolean DEFAULT false NOT NULL,
	"escalonado_para" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contagem" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rotina_id" uuid NOT NULL,
	"insumo_id" uuid NOT NULL,
	"colaborador_telegram_id" text NOT NULL,
	"texto_bruto" text NOT NULL,
	"valor_informado" double precision NOT NULL,
	"quantidade_real_informada" double precision,
	"valor_esperado" double precision NOT NULL,
	"bateu" boolean NOT NULL,
	"confirmado_pelo_colaborador" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "historico_movimento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"insumo_id" uuid NOT NULL,
	"tipo" "tipo_movimento" NOT NULL,
	"quantidade" double precision NOT NULL,
	"origem" "origem_movimento" DEFAULT 'manual' NOT NULL,
	"registrado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "insumo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"loja_id" uuid NOT NULL,
	"categoria" "categoria_insumo" NOT NULL,
	"nome" text NOT NULL,
	"unidade" text NOT NULL,
	"quantidade_padrao_por_pacote" double precision,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "loja" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"telegram_group_id" text NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rotina" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"loja_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"tipo_verificacao" "tipo_verificacao" NOT NULL,
	"frequencia" "frequencia" NOT NULL,
	"criticidade" "criticidade" NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alerta" ADD CONSTRAINT "alerta_contagem_id_contagem_id_fk" FOREIGN KEY ("contagem_id") REFERENCES "public"."contagem"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contagem" ADD CONSTRAINT "contagem_rotina_id_rotina_id_fk" FOREIGN KEY ("rotina_id") REFERENCES "public"."rotina"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contagem" ADD CONSTRAINT "contagem_insumo_id_insumo_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumo"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "historico_movimento" ADD CONSTRAINT "historico_movimento_insumo_id_insumo_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumo"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "insumo" ADD CONSTRAINT "insumo_loja_id_loja_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."loja"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rotina" ADD CONSTRAINT "rotina_loja_id_loja_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."loja"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
