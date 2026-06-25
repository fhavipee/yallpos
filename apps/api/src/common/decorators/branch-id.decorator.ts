import { createParamDecorator, ExecutionContext, BadRequestException } from "@nestjs/common";

export const BranchId = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  const branchId = req.headers["x-branch-id"];
  if (!branchId || typeof branchId !== "string") {
    throw new BadRequestException("Missing header x-branch-id");
  }
  return branchId;
});
