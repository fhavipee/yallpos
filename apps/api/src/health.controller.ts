import { Controller, Get } from "@nestjs/common";
import { Public } from "./auth/decorators/public.decorator";

@Controller("v1/health")
export class HealthController {
  @Public()
  @Get()
  ping() {
    return { status: "ok", service: "yallpos-api" };
  }
}
