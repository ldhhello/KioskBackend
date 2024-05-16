import { jsonEscapeUTF, WebSocketSession, WebSocketInterface } from "./WebSocketSession";

// type PaymentInfo = {
//     name: string,
//     count: number,
//     reservation_time: string,
//     money: number,
//     phone: string,
//     order: any[]
// }

class TicketSession implements WebSocketInterface {
    private ws: any = null;
    private remoteIP: string = '';

    private id: number = 0;

    public initialize(ws: any, ip: string) {
        this.ws = ws;
        this.remoteIP = ip;
    }

    public send(packet: object) {
        this.ws.send(jsonEscapeUTF(JSON.stringify(packet)));
    }

    public close() {
        this.ws.close();
        this.ws = null;

        if(ticketSessionList.get(this.id) == this)
            ticketSessionList.delete(this.id);
    }

    public onError() {
        this.close();
    }
    public onClose(): void {
        this.ws = null;

        if(ticketSessionList.get(this.id) == this)
            ticketSessionList.delete(this.id);
    }
    public onMessage(message: string): void {
        const packet = JSON.parse(message);

        if(packet.method == 'set-ticket') {
            const id = packet.id;

            if(id < 0)
                return;

            if(ticketSessionList.has(id))
                return;

            ticketSessionList.set(id, this);
        }
    }


    public onConfirmed() {
        this.send({
            'method': 'confirm',
            'ok': true
        });
        this.ws.close();
    }
    public onCancelled() {
        this.send({
            'method': 'confirm', 
            'ok': false
        });
        this.ws.close();
    }
}

let ticketSessionList: Map<number, TicketSession> = new Map<number, TicketSession>();

export {TicketSession, ticketSessionList};