import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { TaxDefinitionService } from "../tax/tax-definition.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { CreateCategoryDto } from "./dto/update-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";

@Injectable()
export class CatalogService {
  constructor(
    private prisma: PrismaService,
    private taxes: TaxDefinitionService,
  ) {}

  async getTaxes(branchId: string) {
    const companyId = await this.taxes.getCompanyIdFromBranch(branchId);
    const list = await this.taxes.ensureDefaults(companyId);
    return list.filter((t) => t.isActive);
  }

  async getCategories(branchId: string) {
    return this.prisma.category.findMany({
      where: { branchId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { children: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } },
    });
  }

  async createCategory(branchId: string, dto: CreateCategoryDto) {
    const maxOrder = await this.prisma.category.aggregate({
      where: { branchId },
      _max: { sortOrder: true },
    });
    return this.prisma.category.create({
      data: {
        branchId,
        name: dto.name,
        color: dto.color ?? null,
        sortOrder: dto.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
      },
    });
  }

  async getProducts(
    branchId: string,
    categoryId?: string,
    search?: string,
    includeInactive = false,
    ingredientsOnly = false,
    includeIngredients = false,
  ) {
    return this.prisma.product.findMany({
      where: {
        branchId,
        ...(includeInactive ? {} : { isActive: true }),
        ...(ingredientsOnly ? { isIngredient: true } : includeIngredients ? {} : { isIngredient: false }),
        ...(categoryId ? { categoryId } : {}),
        ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      },
      orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
      include: {
        category: true,
        variants: true,
        recipeLines: {
          orderBy: { sortOrder: "asc" },
          include: {
            ingredientVariant: { include: { product: { include: { category: true } } } },
          },
        },
        modifierGroups: {
          include: {
            modifierGroup: { include: { options: { where: { isActive: true } } } },
          },
        },
      },
    });
  }

  async getIngredients(branchId: string, search?: string) {
    return this.getProducts(branchId, undefined, search, true, true, true);
  }

  async getProductRecipe(branchId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, branchId },
      include: {
        variants: true,
        recipeLines: {
          orderBy: { sortOrder: "asc" },
          include: {
            ingredientVariant: { include: { product: true } },
          },
        },
      },
    });
    if (!product) throw new NotFoundException("Producto no encontrado");
    const recipeCost = this.sumRecipeCost(product.recipeLines);
    return { product, recipeCost };
  }

  async setProductRecipe(branchId: string, productId: string, lines: { ingredientVariantId: string; quantity: number; unit?: string; notes?: string }[]) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, branchId },
      include: { variants: true },
    });
    if (!product) throw new NotFoundException("Producto no encontrado");
    if (product.isIngredient) throw new BadRequestException("Un insumo no puede tener receta propia");

    const variantIds = [...new Set(lines.map((l) => l.ingredientVariantId))];
    if (variantIds.length !== lines.length) {
      throw new BadRequestException("Ingrediente duplicado en la receta");
    }

    const ingredients = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds }, product: { branchId } },
      include: { product: true },
    });
    if (ingredients.length !== variantIds.length) {
      throw new BadRequestException("Uno o más ingredientes no son válidos");
    }

    const ownVariantIds = new Set(product.variants.map((v) => v.id));
    if (lines.some((l) => ownVariantIds.has(l.ingredientVariantId))) {
      throw new BadRequestException("Un producto no puede incluirse a sí mismo como ingrediente");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.productRecipeLine.deleteMany({ where: { productId } });
      if (lines.length) {
        await tx.productRecipeLine.createMany({
          data: lines.map((line, i) => ({
            productId,
            ingredientVariantId: line.ingredientVariantId,
            quantity: line.quantity,
            unit: line.unit ?? ingredients.find((v) => v.id === line.ingredientVariantId)?.unit ?? "und",
            notes: line.notes ?? null,
            sortOrder: i,
          })),
        });
      }

      const recipeLines = await tx.productRecipeLine.findMany({
        where: { productId },
        include: { ingredientVariant: true },
      });
      const recipeCost = this.sumRecipeCost(recipeLines);
      if (product.variants[0] && recipeCost > 0) {
        await tx.productVariant.update({
          where: { id: product.variants[0].id },
          data: { cost: recipeCost },
        });
      }

      if (lines.length > 0 && product.type !== "recipe" && product.type !== "combo") {
        await tx.product.update({ where: { id: productId }, data: { type: "recipe" } });
      }
    });

    return this.getProductRecipe(branchId, productId);
  }

  private sumRecipeCost(lines: { quantity: unknown; ingredientVariant: { cost: unknown } }[]) {
    return Math.round(
      lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.ingredientVariant.cost), 0),
    );
  }

  async getProductByBarcode(branchId: string, barcode: string) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { barcode, isActive: true, product: { branchId, isActive: true } },
      include: {
        product: {
          include: {
            modifierGroups: {
              include: { modifierGroup: { include: { options: true } } },
            },
          },
        },
      },
    });
    if (!variant) throw new NotFoundException("Producto no encontrado");
    return variant;
  }

  async createProduct(branchId: string, dto: CreateProductDto) {
    const warehouse = await this.prisma.warehouse.findFirst({ where: { branchId, isDefault: true } });
    const companyId = await this.taxes.getCompanyIdFromBranch(branchId);
    const ivaTaxCode = dto.ivaTaxCode ?? dto.taxType ?? "iva_19";
    const consumptionTaxCode = dto.consumptionTaxCode ?? dto.consumptionTaxType ?? "none";
    await this.taxes.validateProductTaxCodes(companyId, ivaTaxCode, consumptionTaxCode);

    const product = await this.prisma.product.create({
      data: {
        branchId,
        categoryId: dto.categoryId ?? null,
        name: dto.name,
        description: dto.description ?? null,
        type: dto.type ?? "standard",
        isIngredient: dto.isIngredient ?? false,
        ivaTaxCode,
        consumptionTaxCode,
        course: dto.course ?? null,
        variants: {
          create: {
            name: dto.variantName ?? dto.name,
            sku: dto.sku ?? null,
            barcode: dto.barcode ?? null,
            price: dto.price,
            cost: dto.cost ?? 0,
            sellByWeight: dto.sellByWeight ?? false,
            unit: dto.unit ?? "und",
          },
        },
      },
      include: { variants: true },
    });

    if (warehouse && product.variants[0]) {
      if (product.isIngredient) {
        await this.prisma.stockLevel.create({
          data: { warehouseId: warehouse.id, variantId: product.variants[0].id, quantity: 0 },
        });
      } else if (product.type !== "recipe") {
        await this.prisma.stockLevel.create({
          data: { warehouseId: warehouse.id, variantId: product.variants[0].id, quantity: 100 },
        });
      }
    }

    return product;
  }

  async updateProduct(branchId: string, productId: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, branchId },
      include: { variants: true },
    });
    if (!product) throw new NotFoundException("Producto no encontrado");

    const companyId = await this.taxes.getCompanyIdFromBranch(branchId);
    const ivaTaxCode = dto.ivaTaxCode ?? dto.taxType;
    const consumptionTaxCode = dto.consumptionTaxCode ?? dto.consumptionTaxType;
    if (ivaTaxCode != null || consumptionTaxCode != null) {
      await this.taxes.validateProductTaxCodes(
        companyId,
        ivaTaxCode ?? product.ivaTaxCode,
        consumptionTaxCode ?? product.consumptionTaxCode,
      );
    }

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: {
        name: dto.name ?? product.name,
        categoryId: dto.categoryId !== undefined ? dto.categoryId : product.categoryId,
        course: dto.course !== undefined ? dto.course : product.course,
        isActive: dto.isActive ?? product.isActive,
        type: (dto.type as any) ?? product.type,
        isIngredient: dto.isIngredient ?? product.isIngredient,
        ivaTaxCode: ivaTaxCode ?? product.ivaTaxCode,
        consumptionTaxCode: consumptionTaxCode ?? product.consumptionTaxCode,
        description: dto.description !== undefined ? dto.description : product.description,
      },
      include: { variants: true, category: true },
    });

    if (product.variants[0] && (dto.price !== undefined || dto.cost !== undefined || dto.barcode !== undefined || dto.sku !== undefined || dto.name !== undefined || dto.sellByWeight !== undefined || dto.unit !== undefined)) {
      await this.prisma.productVariant.update({
        where: { id: product.variants[0].id },
        data: {
          ...(dto.price !== undefined ? { price: dto.price } : {}),
          ...(dto.cost !== undefined ? { cost: dto.cost } : {}),
          ...(dto.barcode !== undefined ? { barcode: dto.barcode || null } : {}),
          ...(dto.sku !== undefined ? { sku: dto.sku || null } : {}),
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.sellByWeight !== undefined ? { sellByWeight: dto.sellByWeight } : {}),
          ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
        },
      });
    }

    return this.prisma.product.findUnique({
      where: { id: productId },
      include: { variants: true, category: true },
    });
  }

  async deleteProduct(branchId: string, productId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, branchId } });
    if (!product) throw new NotFoundException("Producto no encontrado");
    return this.prisma.product.update({ where: { id: productId }, data: { isActive: false } });
  }
}
