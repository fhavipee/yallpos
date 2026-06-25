-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('basic', 'professional', 'enterprise', 'corporate');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('owner', 'manager', 'cashier', 'waiter', 'kitchen', 'baker');

-- CreateEnum
CREATE TYPE "BranchType" AS ENUM ('restaurant', 'bakery', 'cafe', 'store');

-- CreateEnum
CREATE TYPE "BusinessVertical" AS ENUM ('restaurant', 'bakery', 'cafe', 'minimarket', 'retail');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('waiter', 'cashier', 'kitchen', 'manager', 'baker');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('standard', 'combo', 'recipe', 'weight_based');

-- CreateEnum
CREATE TYPE "TaxType" AS ENUM ('iva_19', 'iva_5', 'exento', 'no_gravado');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('sale', 'purchase', 'adjustment', 'transfer_in', 'transfer_out', 'production', 'waste', 'return');

-- CreateEnum
CREATE TYPE "TableSessionStatus" AS ENUM ('open', 'closed', 'canceled');

-- CreateEnum
CREATE TYPE "PosSessionStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('withdrawal', 'deposit', 'expense');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('dine_in', 'takeaway', 'delivery', 'counter');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'sent_to_kitchen', 'paid', 'voided', 'refunded');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'card', 'transfer', 'qr', 'credit', 'voucher', 'mixed');

-- CreateEnum
CREATE TYPE "KdsItemStatus" AS ENUM ('new', 'preparing', 'ready', 'served', 'canceled');

-- CreateEnum
CREATE TYPE "KdsTicketStatus" AS ENUM ('new', 'preparing', 'ready', 'served', 'canceled');

-- CreateEnum
CREATE TYPE "FiscalDocType" AS ENUM ('invoice', 'pos_equivalent', 'credit_note', 'debit_note');

-- CreateEnum
CREATE TYPE "FiscalDocStatus" AS ENUM ('pending', 'validating', 'accepted', 'rejected', 'contingency', 'cancelled');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" "PlanTier" NOT NULL DEFAULT 'basic',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nit" TEXT,
    "dv" TEXT,
    "razonSocial" TEXT,
    "regimen" TEXT DEFAULT 'simplificado',
    "vertical" "BusinessVertical" NOT NULL DEFAULT 'restaurant',
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "department" TEXT,
    "country" TEXT NOT NULL DEFAULT 'CO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "BranchType" NOT NULL,
    "address" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Bogota',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "ProductType" NOT NULL DEFAULT 'standard',
    "taxType" "TaxType" NOT NULL DEFAULT 'iva_19',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "imageUrl" TEXT,
    "course" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT,
    "barcode" TEXT,
    "name" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sellByWeight" BOOLEAN NOT NULL DEFAULT false,
    "unit" TEXT NOT NULL DEFAULT 'und',
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModifierGroup" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minSelect" INTEGER NOT NULL DEFAULT 0,
    "maxSelect" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ModifierGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductModifierGroup" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "modifierGroupId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductModifierGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModifierOption" (
    "id" TEXT NOT NULL,
    "modifierGroupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceDelta" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ModifierOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLevel" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "minStock" DECIMAL(65,30) NOT NULL DEFAULT 0,

    CONSTRAINT "StockLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "docType" TEXT NOT NULL DEFAULT 'CC',
    "docNumber" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiningArea" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DiningArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Table" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "diningAreaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableSession" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "waiterId" TEXT NOT NULL,
    "status" "TableSessionStatus" NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "guestsCount" INTEGER,
    "openedByUserId" TEXT,

    CONSTRAINT "TableSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashRegister" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CashRegister_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosSession" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "cashRegisterId" TEXT,
    "userId" TEXT NOT NULL,
    "status" "PosSessionStatus" NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openingCash" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "closingCash" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "expectedCash" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cashDifference" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "PosSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesInvoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "sessionId" TEXT,
    "customerId" TEXT,
    "invoiceNumber" TEXT,
    "idempotencyKey" TEXT,
    "status" "InvoiceStatus" NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "tableSessionId" TEXT,
    "tableId" TEXT,
    "waiterId" TEXT,
    "guestsCount" INTEGER,
    "notes" TEXT,
    "deliveryName" TEXT,
    "deliveryPhone" TEXT,
    "deliveryAddress" TEXT,
    "deliveryReference" TEXT,
    "deliveryFee" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "deliveryStatus" TEXT,
    "tipAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "printedCount" INTEGER NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "discount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "tax" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "SalesInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesInvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "course" TEXT,
    "qty" DECIMAL(65,30) NOT NULL,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "weight" DECIMAL(65,30),
    "lineNotes" TEXT,
    "lineSubtotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "lineDiscount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "lineTax" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,

    CONSTRAINT "SalesInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesLineModifier" (
    "id" TEXT NOT NULL,
    "invoiceLineId" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "priceDeltaSnapshot" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "qty" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "notes" TEXT,

    CONSTRAINT "SalesLineModifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "reference" TEXT,
    "tipAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KdsStation" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "KdsStation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KdsRoutingRule" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "variantId" TEXT,
    "course" TEXT,

    CONSTRAINT "KdsRoutingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KdsTicket" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "status" "KdsTicketStatus" NOT NULL DEFAULT 'new',
    "tableId" TEXT,
    "waiterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KdsTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KdsItem" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "invoiceLineId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "course" TEXT,
    "status" "KdsItemStatus" NOT NULL DEFAULT 'new',
    "startedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "servedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KdsItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalResolution" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "docType" "FiscalDocType" NOT NULL,
    "prefix" TEXT NOT NULL,
    "fromNumber" INTEGER NOT NULL,
    "toNumber" INTEGER NOT NULL,
    "currentNumber" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "technicalKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isContingency" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalResolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectronicDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "resolutionId" TEXT NOT NULL,
    "docType" "FiscalDocType" NOT NULL,
    "docNumber" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "fullNumber" TEXT NOT NULL,
    "cufe" TEXT,
    "cude" TEXT,
    "status" "FiscalDocStatus" NOT NULL DEFAULT 'pending',
    "xmlContent" TEXT,
    "pdfUrl" TEXT,
    "customerDoc" TEXT,
    "customerName" TEXT,
    "subtotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "tax" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "dianResponse" JSONB,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),

    CONSTRAINT "ElectronicDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalContingencyLog" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalContingencyLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "payload" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Company_tenantId_name_key" ON "Company"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Category_branchId_parentId_idx" ON "Category"("branchId", "parentId");

-- CreateIndex
CREATE INDEX "Product_branchId_categoryId_idx" ON "Product"("branchId", "categoryId");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");

-- CreateIndex
CREATE INDEX "ProductVariant_barcode_idx" ON "ProductVariant"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "ProductModifierGroup_productId_modifierGroupId_key" ON "ProductModifierGroup"("productId", "modifierGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "StockLevel_warehouseId_variantId_key" ON "StockLevel"("warehouseId", "variantId");

-- CreateIndex
CREATE INDEX "StockMovement_warehouseId_createdAt_idx" ON "StockMovement"("warehouseId", "createdAt");

-- CreateIndex
CREATE INDEX "Customer_companyId_docNumber_idx" ON "Customer"("companyId", "docNumber");

-- CreateIndex
CREATE INDEX "Table_branchId_diningAreaId_idx" ON "Table"("branchId", "diningAreaId");

-- CreateIndex
CREATE INDEX "TableSession_branchId_tableId_status_idx" ON "TableSession"("branchId", "tableId", "status");

-- CreateIndex
CREATE INDEX "PosSession_branchId_status_idx" ON "PosSession"("branchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoice_idempotencyKey_key" ON "SalesInvoice"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SalesInvoice_branchId_createdAt_idx" ON "SalesInvoice"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "SalesInvoice_status_idx" ON "SalesInvoice"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoice_branchId_invoiceNumber_key" ON "SalesInvoice"("branchId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "SalesInvoiceLine_invoiceId_idx" ON "SalesInvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "SalesLineModifier_invoiceLineId_idx" ON "SalesLineModifier"("invoiceLineId");

-- CreateIndex
CREATE INDEX "KdsTicket_branchId_status_createdAt_idx" ON "KdsTicket"("branchId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "KdsTicket_branchId_invoiceId_key" ON "KdsTicket"("branchId", "invoiceId");

-- CreateIndex
CREATE INDEX "KdsItem_stationId_status_createdAt_idx" ON "KdsItem"("stationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "FiscalResolution_companyId_docType_isActive_idx" ON "FiscalResolution"("companyId", "docType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ElectronicDocument_fullNumber_key" ON "ElectronicDocument"("fullNumber");

-- CreateIndex
CREATE INDEX "ElectronicDocument_companyId_status_idx" ON "ElectronicDocument"("companyId", "status");

-- CreateIndex
CREATE INDEX "ElectronicDocument_invoiceId_idx" ON "ElectronicDocument"("invoiceId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductModifierGroup" ADD CONSTRAINT "ProductModifierGroup_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductModifierGroup" ADD CONSTRAINT "ProductModifierGroup_modifierGroupId_fkey" FOREIGN KEY ("modifierGroupId") REFERENCES "ModifierGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModifierOption" ADD CONSTRAINT "ModifierOption_modifierGroupId_fkey" FOREIGN KEY ("modifierGroupId") REFERENCES "ModifierGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningArea" ADD CONSTRAINT "DiningArea_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Table" ADD CONSTRAINT "Table_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Table" ADD CONSTRAINT "Table_diningAreaId_fkey" FOREIGN KEY ("diningAreaId") REFERENCES "DiningArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSession" ADD CONSTRAINT "PosSession_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSession" ADD CONSTRAINT "PosSession_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PosSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_tableSessionId_fkey" FOREIGN KEY ("tableSessionId") REFERENCES "TableSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PosSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesLineModifier" ADD CONSTRAINT "SalesLineModifier_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "SalesInvoiceLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KdsStation" ADD CONSTRAINT "KdsStation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KdsRoutingRule" ADD CONSTRAINT "KdsRoutingRule_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "KdsStation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KdsItem" ADD CONSTRAINT "KdsItem_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "KdsTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KdsItem" ADD CONSTRAINT "KdsItem_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "KdsStation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalResolution" ADD CONSTRAINT "FiscalResolution_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectronicDocument" ADD CONSTRAINT "ElectronicDocument_resolutionId_fkey" FOREIGN KEY ("resolutionId") REFERENCES "FiscalResolution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectronicDocument" ADD CONSTRAINT "ElectronicDocument_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalContingencyLog" ADD CONSTRAINT "FiscalContingencyLog_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ElectronicDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
