import express, { Request, Response, NextFunction, Express } from 'express';
const wsModule = require('ws');
import * as https from 'https';
import * as fs from 'fs';

import {WebSocketSession} from './WebSocketSession';

class Server {
    private app: Express;
    private port: Number;

    private httpServer: any;
    private wsServer: any;

    private cert_file: string;
    private key_file: string;

    constructor(port: Number, router: any) {
        this.app = express();
        this.port = port;

        router.setRoute(this.app);

        /*if(process.platform == 'darwin') {
            this.cert_file = "/Users/donghyun/MafiaServer_data/cert.pem";
            this.key_file = "/Users/donghyun/MafiaServer_data/key.pem";
        }
        else {
            this.cert_file = "/key/cert.pem";
            this.key_file = "/key/key.pem";
        }*/

        this.cert_file = this.key_file = '';
    }

    public runHTTPS() {
        const server = new https.Server({
            cert: fs.readFileSync(this.cert_file),
            key: fs.readFileSync(this.key_file),
        
            // TLS Versions
            minVersion: 'TLSv1.2'
        }, this.app);

        this.httpServer = server.listen(this.port, () => {
            console.log(`HTTPS Server is open at port:${this.port}`);
        });

        this.httpServer = server;

        this.startWebSocketServer(this.wsServer);
    }

    public run(webSocket?: boolean) {
        this.httpServer = this.app.listen(this.port, () => {
            console.log(`Server is open at port:${this.port}`);
        });

        if(webSocket === undefined)
            webSocket = true;

        if(webSocket)
            this.startWebSocketServer(this.wsServer);
    }

    private startWebSocketServer(ws: any) {
        this.wsServer = new wsModule.Server( 
            {
                server: this.httpServer,
                // port: 30002
            }
        );

        this.wsServer.on('connection', (ws: any, request: any) => {
            const ip : string = request.headers['x-forwarded-for'] || request.connection.remoteAddress;
            let session = new WebSocketSession(ws, ip);
            
            ws.on('message', (msg: string) => {
                try {
                    session.onMessage(msg);
                }
                catch(e) {}
            })
            
            ws.on('error', (error: any) => {
                try {
                    session.onError(error);
                }
                catch(e) {}
            })
            
            ws.on('close', () => {
                try {
                    session.onClose();
                }
                catch(e) {}
            })

            session.onConnected();
        });
    }
}

export default Server;