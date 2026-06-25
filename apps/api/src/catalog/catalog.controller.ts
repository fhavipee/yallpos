import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { BranchId } from "../common/decorators/branch-id.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { FLOOR_ROLES, MANAGEMENT_ROLES } from "../auth/auth.types";
import { CatalogService } from "./catalog.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { CreateCategoryDto, UpdateProductDto } from "./dto/update-product.dto";

@Controller("v1/catalog")
export class CatalogController {
  constructor(private catalog: CatalogService) {}

  @Roles(...FLOOR_ROLES)
  @Get("categories")
  getCategories(@BranchId() branchId: string) {
    return this.catalog.getCategories(branchId);
  }

  @Roles(...MANAGEMENT_ROLES)
  @Post("categories")
  createCategory(@BranchId() branchId: string, @Body() dto: CreateCategoryDto) {
    return this.catalog.createCategory(branchId, dto);
  }

  @Roles(...FLOOR_ROLES)
  @Get("products")
  getProducts(
    @BranchId() branchId: string,
    @Query("categoryId") categoryId?: string,
    @Query("search") search?: string,
    @Query("all") all?: string,
  ) {
    return this.catalog.getProducts(branchId, categoryId, search, all === "1");
  }

  @Roles(...FLOOR_ROLES)
  @Get("barcode/:code")
  getByBarcode(@BranchId() branchId: string, @Param("code") code: string) {
    return this.catalog.getProductByBarcode(branchId, code);
  }

  @Roles(...MANAGEMENT_ROLES)
  @Post("products")
  createProduct(@BranchId() branchId: string, @Body() dto: CreateProductDto) {
    return this.catalog.createProduct(branchId, dto);
  }

  @Roles(...MANAGEMENT_ROLES)
  @Patch("products/:id")
  updateProduct(@BranchId() branchId: string, @Param("id") id: string, @Body() dto: UpdateProductDto) {
    return this.catalog.updateProduct(branchId, id, dto);
  }

  @Roles(...MANAGEMENT_ROLES)
  @Delete("products/:id")
  deleteProduct(@BranchId() branchId: string, @Param("id") id: string) {
    return this.catalog.deleteProduct(branchId, id);
  }
}
