import { WebSocketGateway, WebSocketServer, OnGatewayConnection } from "@nestjs/websockets";
import { Server, Socket } from "socket.io";

@WebSocketGateway({
  namespace: "/kds",
  cors: { origin: "*" },
})
export class KdsGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;

  handleConnection(client: Socket) {
    const branchId = client.handshake.query.branchId as string | undefined;
    const stationId = client.handshake.query.stationId as string | undefined;
    if (branchId) client.join(`branch:${branchId}`);
    if (stationId) client.join(`station:${stationId}`);
  }

  emitKdsTicketCreated(branchId: string, stationId: string, payload: any) {
    this.server.to(`branch:${branchId}`).emit("kds.ticket.created", payload);
    this.server.to(`station:${stationId}`).emit("kds.ticket.created", payload);
  }

  emitKdsItemUpdated(branchId: string, stationId: string, payload: any) {
    this.server.to(`branch:${branchId}`).emit("kds.item.updated", payload);
    this.server.to(`station:${stationId}`).emit("kds.item.updated", payload);
  }

  emitTableUpdated(branchId: string, payload: any) {
    this.server.to(`branch:${branchId}`).emit("pos.table.updated", payload);
  }

  emitInvoicePaid(branchId: string, payload: any) {
    this.server.to(`branch:${branchId}`).emit("pos.invoice.paid", payload);
  }

  emitInvoiceVoided(branchId: string, payload: any) {
    this.server.to(`branch:${branchId}`).emit("kds.invoice.voided", payload);
  }

  emitLineVoided(branchId: string, payload: any) {
    this.server.to(`branch:${branchId}`).emit("kds.line.voided", payload);
  }

  emitInvoiceUpdated(branchId: string, payload: any) {
    this.server.to(`branch:${branchId}`).emit("pos.invoice.updated", payload);
  }

  emitTableReady(branchId: string, payload: any) {
    this.server.to(`branch:${branchId}`).emit("kds.table.ready", payload);
  }

  emitTableServed(branchId: string, payload: any) {
    this.server.to(`branch:${branchId}`).emit("kds.table.served", payload);
  }
}
