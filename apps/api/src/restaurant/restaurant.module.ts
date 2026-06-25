import { Module } from "@nestjs/common";
import { RestaurantController } from "./restaurant.controller";
import { RestaurantService } from "./restaurant.service";
import { WaiterAttributionService } from "./waiter-attribution.service";
import { KdsModule } from "../kds/kds.module";

@Module({
  imports: [KdsModule],
  controllers: [RestaurantController],
  providers: [RestaurantService, WaiterAttributionService],
  exports: [RestaurantService, WaiterAttributionService],
})
export class RestaurantModule {}
