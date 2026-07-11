import { Body, Controller, Delete, Get, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./decorators/current-user.decorator";
import { LoginDto } from "./dto/login.dto";
import { RegisterTenantDto } from "./dto/register-tenant.dto";
import { Public } from "./decorators/public.decorator";
import { AuthUser } from "./auth.types";
import { IsOptional, IsString, MinLength } from "class-validator";

class TotpEnableDto {
  @IsString()
  @MinLength(6)
  code!: string;

  @IsOptional()
  @IsString()
  secret?: string;
}

class TotpDisableDto {
  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  approvalPin?: string;
}

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
    return this.auth.getMe(user);
  }

  @Get("me/totp/setup")
  totpSetup(@CurrentUser() user: AuthUser) {
    return this.auth.beginTotpSetup(user);
  }

  @Post("me/totp/enable")
  totpEnable(@CurrentUser() user: AuthUser, @Body() dto: TotpEnableDto) {
    return this.auth.enableTotp(user, dto.code, dto.secret);
  }

  @Delete("me/totp")
  totpDisable(@CurrentUser() user: AuthUser, @Body() dto: TotpDisableDto) {
    return this.auth.disableTotp(user, dto);
  }
}
