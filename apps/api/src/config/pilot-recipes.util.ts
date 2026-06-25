import { PrismaClient, ProductType } from "@prisma/client";
import {
  PILOT_YALL,
  resolvePilotItemConsumptionTax,
  resolvePilotItemTax,
} from "./pilot-yall.config";

export async function seedPilotIngredientsAndRecipes(
  prisma: PrismaClient,
  branchId: string,
  warehouseId: string,
) {
  const ingGroup = PILOT_YALL.ingredients;
  if (!ingGroup) return { ingredientsCreated: 0, recipesLinked: 0 };

  let category = await prisma.category.findFirst({
    where: { branchId, name: ingGroup.cat },
  });
  if (!category) {
    category = await prisma.category.create({
      data: {
        branchId,
        name: ingGroup.cat,
        color: ingGroup.color,
        sortOrder: 99,
      },
    });
  }

  let ingredientsCreated = 0;
  for (const item of ingGroup.items) {
    const [name, cost, barcode] = item;
    const existing = await prisma.productVariant.findFirst({
      where: { barcode, product: { branchId } },
    });
    if (existing) continue;

    const product = await prisma.product.create({
      data: {
        branchId,
        categoryId: category.id,
        name,
        type: ProductType.standard,
        isIngredient: true,
        isActive: true,
        course: ingGroup.course,
        ivaTaxCode: resolvePilotItemTax(ingGroup, item),
        consumptionTaxCode: resolvePilotItemConsumptionTax(ingGroup, item),
        variants: {
          create: {
            name,
            barcode,
            price: 0,
            cost,
          },
        },
      },
      include: { variants: true },
    });

    await prisma.stockLevel.create({
      data: { warehouseId, variantId: product.variants[0].id, quantity: 1000 },
    });
    ingredientsCreated++;
  }

  let recipesLinked = 0;
  for (const recipe of PILOT_YALL.recipes ?? []) {
    const dishVariant = await prisma.productVariant.findFirst({
      where: { barcode: recipe.dishBarcode, product: { branchId } },
      include: { product: true },
    });
    if (!dishVariant) continue;

    const lineData: { ingredientVariantId: string; quantity: number; cost: number }[] = [];
    for (const [ingBarcode, qty] of recipe.lines) {
      const ingVariant = await prisma.productVariant.findFirst({
        where: { barcode: ingBarcode, product: { branchId } },
      });
      if (!ingVariant) continue;
      lineData.push({
        ingredientVariantId: ingVariant.id,
        quantity: qty,
        cost: Number(ingVariant.cost),
      });
    }

    await prisma.productRecipeLine.deleteMany({ where: { productId: dishVariant.productId } });
    if (!lineData.length) continue;

    await prisma.productRecipeLine.createMany({
      data: lineData.map((line, i) => ({
        productId: dishVariant.productId,
        ingredientVariantId: line.ingredientVariantId,
        quantity: line.quantity,
        sortOrder: i,
      })),
    });

    const recipeCost = Math.round(
      lineData.reduce((sum, line) => sum + line.quantity * line.cost, 0),
    );

    await prisma.product.update({
      where: { id: dishVariant.productId },
      data: { type: ProductType.recipe },
    });

    if (dishVariant.id) {
      await prisma.productVariant.update({
        where: { id: dishVariant.id },
        data: { cost: recipeCost },
      });
    }

    recipesLinked++;
  }

  return { ingredientsCreated, recipesLinked };
}
