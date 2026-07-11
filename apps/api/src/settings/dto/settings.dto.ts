import { IsDateString, IsInt, IsOptional, IsString } from "class-validator";

export class UpdateCompanyDto {
  @IsOptional() @IsString() razonSocial?: string;
  @IsOptional() @IsString() nit?: string;
  @IsOptional() @IsString() dv?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;
}

export class UpdateFiscalResolutionDto {
  @IsOptional() @IsString() prefix?: string;
  @IsOptional() @IsInt() fromNumber?: number;
  @IsOptional() @IsInt() toNumber?: number;
  @IsOptional() @IsDateString() validFrom?: string;
  @IsOptional() @IsDateString() validTo?: string;
  @IsOptional() @IsString() technicalKey?: string;
}

export class UpdateBranchSettingsDto {
  @IsOptional()
  printers?: {
    cashPrinterIp?: string;
    cashPrinterPort?: string;
    kitchenPrinterIp?: string;
    kitchenPrinterPort?: string;
  };

  @IsOptional()
  notifications?: {
    webhookUrl?: string;
    reservationRemindMinutes?: number;
    pickupNotifyAuto?: boolean;
    reservationSoundEnabled?: boolean;
    printSeatingSlipOnReservation?: boolean;
    tableReadySoundEnabled?: boolean;
    tableReadyWarnMinutes?: number;
    tableReadyOverdueSoundEnabled?: boolean;
    tableReadyOverdueWebhookEnabled?: boolean;
    hostPhone?: string;
    tableReadyHostWhatsAppEnabled?: boolean;
    tableReadyWaiterWhatsAppEnabled?: boolean;
    tableReadySlaMinutes?: number;
    tableReadySlaWebhookEnabled?: boolean;
  };

  @IsOptional()
  kiosk?: {
    /** PIN de gerente/administrador (4-6 dígitos). Se almacena hasheado. */
    adminPin?: string;
    /** @deprecated Usar adminPin — se migra automáticamente al guardar */
    waiterExitPin?: string;
  };

  @IsOptional()
  pos?: {
    /** Descuento máximo (%) que no requiere PIN de supervisor. */
    maxDiscountPercentWithoutPin?: number;
    /** manual = esperar "Enviar a cocina"; auto = cada producto va al KDS al agregarlo. */
    kitchenSendMode?: "manual" | "auto";
    requireApprovalVoidInvoice?: boolean;
    requireApprovalVoidLine?: boolean;
    /** pin = solo PIN · totp = solo autenticador · both = cualquiera */
    approvalMethod?: "pin" | "totp" | "both";
  };
}
