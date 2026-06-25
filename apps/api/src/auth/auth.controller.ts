import { Body, Controller, Get, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./decorators/current-user.decorator";
import { LoginDto } from "./dto/login.dto";
import { RegisterTenantDto } from "./dto/register-tenant.dto";
import { Public } from "./decorators/public.decorator";
import { AuthUser } from "./auth.types";

@Controller("v1/auth")
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @Post("register")
  register(@Body() dto: RegisterTenantDto) {
    return this.auth.registerTenant(dto);
  }

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return { user };
  }
}
