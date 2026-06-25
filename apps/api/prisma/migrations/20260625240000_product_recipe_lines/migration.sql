-- Recetas: productos con ingredientes (BOM)
ALTER TABLE "Product" ADD COLUMN "isIngredient" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ProductRecipeLine" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "ingredientVariantId" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'und',
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductRecipeLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductRecipeLine_productId_ingredientVariantId_key" ON "ProductRecipeLine"("productId", "ingredientVariantId");
CREATE INDEX "ProductRecipeLine_productId_idx" ON "ProductRecipeLine"("productId");

ALTER TABLE "ProductRecipeLine" ADD CONSTRAINT "ProductRecipeLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductRecipeLine" ADD CONSTRAINT "ProductRecipeLine_ingredientVariantId_fkey" FOREIGN KEY ("ingredientVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
