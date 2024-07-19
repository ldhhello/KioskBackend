import { jsonEscapeUTF, WebSocketSession, WebSocketInterface } from "./WebSocketSession";
import { ticketSessionList } from "./TicketSession";
import { Database, database, InventoryType } from './Database';

type PaymentInfo = {
    name: string,
    count: number,
    reservation_time: string,
    money: number,
    phone: string,
    ticket_id: number,
    order: any[]
}

class DashboardSession implements WebSocketInterface {
    private ws: any = null;
    private remoteIP: string = '';

    private targetTime: string = '';

    public initialize(ws: any, ip: string) {
        this.ws = ws;
        this.remoteIP = ip;

        dashboardSet.add(this);
    }

    public send(packet: object) {
        this.ws.send(jsonEscapeUTF(JSON.stringify(packet)));
    }

    public close() {
        this.ws.close();
        this.ws = null;

        if(dashboardSet.has(this))
            dashboardSet.delete(this);
    }

    public onError() {
        this.close();
    }
    public onClose(): void {
        this.ws = null;

        if(dashboardSet.has(this))
            dashboardSet.delete(this);
    }
    public async onMessage(message: string): Promise<void> {
        const packet = JSON.parse(message);

        if(packet.method == 'confirm-payment') {
            const id = packet.id;
            await database.confirmPayment(id);
            ticketSessionList.get(id)?.onConfirmed();

            await this.onInventoryChanged();
        }
        else if(packet.method == 'cancel-payment') {
            const id = packet.id;
            await database.cancelPayment(id);
            ticketSessionList.get(id)?.onCancelled();

            await this.onInventoryChanged();
        }
        else if(packet.method == 'request-inventory') {
            await this.onInventoryChanged();
        }
        else if(packet.method == 'modify-inventory') {
            const name: string = packet.name;
            const count: number = packet.count;

            await database.modifyInventory(name, count);

            await this.onInventoryChanged();
        }
        else if(packet.method == 'set-time') {
            const time = packet.time;
            this.targetTime = time;
        }
        this.send({
            'ok': true
        });
    }


    public onRequestPayment(paymentInfo: PaymentInfo) {
        this.send({
            'method': 'payment',
            'data': paymentInfo
        });
    }

    public async onInventoryChanged() {
        let inventory = await database.getInventory();

        this.send({
            'method': 'inventory',
            'data': inventory
        });
    }
}

let dashboardSet: Set<DashboardSession> = new Set<DashboardSession>();

export {DashboardSession, dashboardSet};