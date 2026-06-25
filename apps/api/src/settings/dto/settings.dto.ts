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
    waiterExitPin?: string;
  };
}
