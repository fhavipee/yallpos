import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { CreateCategoryDto } from "./dto/update-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";

@Injectable()
export class CatalogService {
  constructor(private prisma: PrismaService) {}

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

  async getProducts(branchId: string, categoryId?: string, search?: string, includeInactive = false) {
    return this.prisma.product.findMany({
      where: {
        branchId,
        ...(includeInactive ? {} : { isActive: true }),
        ...(categoryId ? { categoryId } : {}),
        ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      },
      orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
      include: {
        category: true,
        variants: true,
        modifierGroups: {
          include: {
            modifierGroup: { include: { options: { where: { isActive: true } } } },
          },
        },
      },
    });
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

    const product = await this.prisma.product.create({
      data: {
        branchId,
        categoryId: dto.categoryId ?? null,
        name: dto.name,
        description: dto.description ?? null,
        type: dto.type ?? "standard",
        taxType: dto.taxType ?? "iva_19",
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
      await this.prisma.stockLevel.create({
        data: { warehouseId: warehouse.id, variantId: product.variants[0].id, quantity: 100 },
      });
    }

    return product;
  }

  async updateProduct(branchId: string, productId: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, branchId },
      include: { variants: true },
    });
    if (!product) throw new NotFoundException("Producto no encontrado");

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: {
        name: dto.name ?? product.name,
        categoryId: dto.categoryId !== undefined ? dto.categoryId : product.categoryId,
        course: dto.course !== undefined ? dto.course : product.course,
        isActive: dto.isActive ?? product.isActive,
        taxType: dto.taxType as any ?? product.taxType,
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
