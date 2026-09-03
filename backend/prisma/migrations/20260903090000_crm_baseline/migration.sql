BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('LEGAL_ENTITY', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "StageOutcome" AS ENUM ('NONE', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('OPEN', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('CALL', 'EMAIL', 'MESSAGE', 'MEETING', 'TASK', 'DOCUMENT', 'DEAL_CHANGE', 'NOTE');

-- CreateEnum
CREATE TYPE "ActivityDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "DedupKeyType" AS ENUM ('INN', 'PHONE', 'EMAIL', 'NAME');

-- CreateEnum
CREATE TYPE "CustomFieldEntity" AS ENUM ('CLIENT', 'DEAL');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT', 'MULTISELECT', 'USER', 'MONEY');

-- CreateTable
CREATE TABLE "Client" (
    "id" UUID NOT NULL,
    "type" "ClientType" NOT NULL,
    "name" TEXT NOT NULL,
    "inn" VARCHAR(12),
    "kpp" VARCHAR(9),
    "ogrn" VARCHAR(15),
    "legalAddress" TEXT,
    "actualAddress" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "source" TEXT,
    "segment" TEXT,
    "comment" TEXT,
    "responsibleUserId" UUID NOT NULL,
    "lastContactAt" TIMESTAMP(3),
    "mergedIntoId" UUID,
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "position" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientTag" (
    "clientId" UUID NOT NULL,
    "tagId" UUID NOT NULL,

    CONSTRAINT "ClientTag_pkey" PRIMARY KEY ("clientId","tagId")
);

-- CreateTable
CREATE TABLE "Pipeline" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineStage" (
    "id" UUID NOT NULL,
    "pipelineId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "color" TEXT,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "outcome" "StageOutcome" NOT NULL DEFAULT 'NONE',
    "onEnterTaskTemplateId" UUID,
    "probability" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "pipelineId" UUID NOT NULL,
    "stageId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(14,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'RUB',
    "probability" INTEGER,
    "expectedCloseDate" TIMESTAMP(3),
    "responsibleUserId" UUID NOT NULL,
    "nextActionAt" TIMESTAMP(3),
    "nextActionDescription" TEXT,
    "status" "DealStatus" NOT NULL DEFAULT 'OPEN',
    "lossReasonId" UUID,
    "lastActivityAt" TIMESTAMP(3),
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealStageHistory" (
    "id" UUID NOT NULL,
    "dealId" UUID NOT NULL,
    "fromStageId" UUID,
    "toStageId" UUID NOT NULL,
    "changedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealStageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LossReason" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LossReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "dealId" UUID,
    "number" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "amount" DECIMAL(14,2),
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "expiresAt" TIMESTAMP(3),
    "fileId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "dealId" UUID,
    "number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'ISSUED',
    "fileId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "dealId" UUID,
    "userId" UUID,
    "contactId" UUID,
    "type" "ActivityType" NOT NULL,
    "entityType" TEXT,
    "entityId" UUID,
    "summary" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "externalSrc" TEXT,
    "externalId" TEXT,
    "direction" "ActivityDirection",
    "durationSec" INTEGER,
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientDedupKey" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "type" "DedupKeyType" NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "ClientDedupKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldDefinition" (
    "id" UUID NOT NULL,
    "entity" "CustomFieldEntity" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL,
    "options" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "fieldCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Client_responsibleUserId_idx" ON "Client"("responsibleUserId");

-- CreateIndex
CREATE INDEX "Client_inn_idx" ON "Client"("inn");

-- CreateIndex
CREATE INDEX "Client_lastContactAt_idx" ON "Client"("lastContactAt");

-- CreateIndex
CREATE INDEX "Client_deletedAt_idx" ON "Client"("deletedAt");

-- CreateIndex
CREATE INDEX "Contact_clientId_idx" ON "Contact"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_type_name_key" ON "Tag"("type", "name");

-- CreateIndex
CREATE INDEX "ClientTag_tagId_idx" ON "ClientTag"("tagId");

-- CreateIndex
CREATE INDEX "PipelineStage_pipelineId_idx" ON "PipelineStage"("pipelineId");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineStage_pipelineId_position_key" ON "PipelineStage"("pipelineId", "position");

-- CreateIndex
CREATE INDEX "Deal_clientId_idx" ON "Deal"("clientId");

-- CreateIndex
CREATE INDEX "Deal_responsibleUserId_idx" ON "Deal"("responsibleUserId");

-- CreateIndex
CREATE INDEX "Deal_pipelineId_stageId_idx" ON "Deal"("pipelineId", "stageId");

-- CreateIndex
CREATE INDEX "Deal_status_expectedCloseDate_idx" ON "Deal"("status", "expectedCloseDate");

-- CreateIndex
CREATE INDEX "Deal_nextActionAt_idx" ON "Deal"("nextActionAt");

-- CreateIndex
CREATE INDEX "Deal_lastActivityAt_idx" ON "Deal"("lastActivityAt");

-- CreateIndex
CREATE INDEX "DealStageHistory_dealId_createdAt_idx" ON "DealStageHistory"("dealId", "createdAt");

-- CreateIndex
CREATE INDEX "DealStageHistory_toStageId_createdAt_idx" ON "DealStageHistory"("toStageId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LossReason_name_key" ON "LossReason"("name");

-- CreateIndex
CREATE INDEX "Contract_clientId_idx" ON "Contract"("clientId");

-- CreateIndex
CREATE INDEX "Contract_expiresAt_idx" ON "Contract"("expiresAt");

-- CreateIndex
CREATE INDEX "Invoice_clientId_idx" ON "Invoice"("clientId");

-- CreateIndex
CREATE INDEX "Invoice_paymentStatus_dueDate_idx" ON "Invoice"("paymentStatus", "dueDate");

-- CreateIndex
CREATE INDEX "Activity_clientId_occurredAt_idx" ON "Activity"("clientId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "Activity_dealId_occurredAt_idx" ON "Activity"("dealId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "Activity_type_occurredAt_idx" ON "Activity"("type", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_externalSrc_externalId_key" ON "Activity"("externalSrc", "externalId");

-- CreateIndex
CREATE INDEX "ClientDedupKey_type_value_idx" ON "ClientDedupKey"("type", "value");

-- CreateIndex
CREATE UNIQUE INDEX "ClientDedupKey_type_value_clientId_key" ON "ClientDedupKey"("type", "value", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldDefinition_fieldCode_key" ON "CustomFieldDefinition"("fieldCode");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldDefinition_entity_key_key" ON "CustomFieldDefinition"("entity", "key");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientTag" ADD CONSTRAINT "ClientTag_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientTag" ADD CONSTRAINT "ClientTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineStage" ADD CONSTRAINT "PipelineStage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "PipelineStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_lossReasonId_fkey" FOREIGN KEY ("lossReasonId") REFERENCES "LossReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStageHistory" ADD CONSTRAINT "DealStageHistory_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStageHistory" ADD CONSTRAINT "DealStageHistory_fromStageId_fkey" FOREIGN KEY ("fromStageId") REFERENCES "PipelineStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStageHistory" ADD CONSTRAINT "DealStageHistory_toStageId_fkey" FOREIGN KEY ("toStageId") REFERENCES "PipelineStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientDedupKey" ADD CONSTRAINT "ClientDedupKey_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
