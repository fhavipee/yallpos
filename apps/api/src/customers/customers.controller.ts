import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { BranchId } from "../common/decorators/branch-id.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { CASH_ROLES, FLOOR_ROLES, MANAGEMENT_ROLES } from "../auth/auth.types";
import { CustomersService } from "./customers.service";
import { AttachCustomerDto, UpdateGenericBuyerDto, UpsertCustomerDto } from "./dto/customer.dto";

@Controller("v1/customers")
export class CustomersController {
  constructor(private customers: CustomersService) {}

  @Roles(...FLOOR_ROLES)
  @Get()
  list(@BranchId() branchId: string, @Query("q") q?: string, @Query("take") take?: string) {
    return this.customers.list(branchId, q, take ? Number(take) : 50);
  }

  @Roles(...FLOOR_ROLES)
  @Get("generic")
  getGeneric(@BranchId() branchId: string) {
    return this.customers.getGenericBuyer(branchId);
  }

  @Roles(...MANAGEMENT_ROLES)
  @Patch("generic")
  updateGeneric(@BranchId() branchId: string, @Body() dto: UpdateGenericBuyerDto) {
    return this.customers.updateGenericBuyer(branchId, dto);
  }

  @Roles(...FLOOR_ROLES)
  @Get(":id")
  getOne(@BranchId() branchId: string, @Param("id") id: string) {
    return this.customers.getById(branchId, id);
  }

  @Roles(...CASH_ROLES)
  @Post()
  create(@BranchId() branchId: string, @Body() dto: UpsertCustomerDto) {
    return this.customers.create(branchId, dto);
  }

  @Roles(...CASH_ROLES)
  @Patch(":id")
  update(@BranchId() branchId: string, @Param("id") id: string, @Body() dto: UpsertCustomerDto) {
    return this.customers.update(branchId, id, dto);
  }
}

@Controller("v1/pos/invoices")
export class InvoiceCustomerController {
  constructor(private customers: CustomersService) {}

  @Roles(...CASH_ROLES)
  @Post(":id/customer")
  attach(
    @BranchId() branchId: string,
    @Param("id") id: string,
    @Body() dto: AttachCustomerDto,
  ) {
    return this.customers.attachToInvoice(branchId, id, dto);
  }
}
