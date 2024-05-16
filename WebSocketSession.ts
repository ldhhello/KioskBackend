import {DashboardSession} from "./DashboardSession";
import { TicketSession } from "./TicketSession";

function jsonEscapeUTF(s: string) {
    return s.replace(/[^\x20-\x7F]/g, (x: any) => "\\u" + ("000"+x.codePointAt(0).toString(16)).slice(-4))
}

interface WebSocketInterface {
    initialize(ws: any, ip: string): void;
    close(): void;
    onClose(): void;
    onError(): void;
    onMessage(message: string): void;
}

class WebSocketSession {

    private ws: any = null;
    private remoteIP: string;

    private session?: WebSocketInterface = undefined;

    constructor(ws: any, ip: string) {
        this.ws = ws;
        this.remoteIP = ip;
    }

    public send(packet: object) {
        this.ws.send(jsonEscapeUTF(JSON.stringify(packet)));
    }

    public close() {
        this.ws.close();
        this.session?.close();
        this.ws = null;
    }

    public onConnected() {
        //this.send(Method.HELLO, ['MafiaServer_web', '1.0']);
        this.send({
            'method': 'hello',
            'server': 'DH Kiosk Server'
        });
        console.log(`Connected: ${this.remoteIP}`);


    }

    public onError(error: any) {
        this.session?.onError();

        //console.log(`Error! ${error}`);
        this.close();
    }

    public onClose() {
        this.session?.onClose();

        console.log(`Closed: ${this.remoteIP}`);
        this.ws = null;
    }

    public onMessage(message: string) {
        try {
            if(this.session !== undefined) {
                this.session.onMessage(message);
                return;
            }

            const packet = JSON.parse(message);

            if(packet.method != 'change_protocol') {
                this.send({
                    'ok': false
                });
                this.close();
                return;
            }

            if(packet.authorization != 'wegrTYpd') {
                this.send({
                    'ok': false
                });
                this.close();
                return;
            }

            if(packet.type == 'dashboard') {
                this.session = new DashboardSession();
                this.session.initialize(this.ws, this.remoteIP);

                this.send({
                    'ok': true
                });
                return;
            }
            if(packet.type == 'ticket') {
                this.session = new TicketSession();
                this.session.initialize(this.ws, this.remoteIP);

                this.send({
                    'ok': true
                });
                return;
            }

            this.send({
                'ok': false
            });
            this.close();
        }
        catch(e) {
            this.close();
            return;
        }
    }
}

export {jsonEscapeUTF, WebSocketSession, WebSocketInterface};