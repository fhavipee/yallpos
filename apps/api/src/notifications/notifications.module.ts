import { Module } from "@nestjs/common";
import { OrderNotifyService } from "./order-notify.service";

@Module({
  providers: [OrderNotifyService],
  exports: [OrderNotifyService],
})
export class NotificationsModule {}
