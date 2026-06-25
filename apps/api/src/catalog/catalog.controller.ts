import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { BranchId } from "../common/decorators/branch-id.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { FLOOR_ROLES, MANAGEMENT_ROLES } from "../auth/auth.types";
import { CatalogService } from "./catalog.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { CreateCategoryDto, UpdateProductDto } from "./dto/update-product.dto";
import { SetProductRecipeDto } from "./dto/recipe.dto";

@Controller("v1/catalog")
export class CatalogController {
  constructor(private catalog: CatalogService) {}

  @Roles(...FLOOR_ROLES)
  @Get("categories")
  getCategories(@BranchId() branchId: string) {
    return this.catalog.getCategories(branchId);
  }

  @Roles(...FLOOR_ROLES)
  @Get("taxes")
  getTaxes(@BranchId() branchId: string) {
    return this.catalog.getTaxes(branchId);
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
    @Query("ingredients") ingredients?: string,
  ) {
    if (ingredients === "1") {
      return this.catalog.getIngredients(branchId, search);
    }
    return this.catalog.getProducts(
      branchId,
      categoryId,
      search,
      all === "1",
      false,
      all === "1",
    );
  }

  @Roles(...MANAGEMENT_ROLES)
  @Get("products/:id/recipe")
  getProductRecipe(@BranchId() branchId: string, @Param("id") id: string) {
    return this.catalog.getProductRecipe(branchId, id);
  }

  @Roles(...MANAGEMENT_ROLES)
  @Put("products/:id/recipe")
  setProductRecipe(@BranchId() branchId: string, @Param("id") id: string, @Body() dto: SetProductRecipeDto) {
    return this.catalog.setProductRecipe(branchId, id, dto.lines);
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
