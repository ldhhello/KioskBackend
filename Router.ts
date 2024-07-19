import express, { Request, Response, NextFunction, Express } from 'express';
import {ConnectionPool, connectionPool} from './ConnectionPool';
import { DashboardSession, dashboardSet } from './DashboardSession';
import { Database, database, AvailableTimesType } from './Database';
import errorHandler from 'errorhandler';

import cors from 'cors';

let secretKey = 'wegrTYpd';

class Router {

    private send(res: Response, data: object) {
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(data));
    }

    private authorize(req: Request) {
        let auth: string = req.headers['authorization'];
        if(auth === undefined)
            return false;

        if(auth.indexOf(secretKey) != 0)
            return false;

        return true;
    }

    public setRoute(app: Express) {
        app.use(express.json());
        app.use(cors());
        //app.use(errorHandler({ dumpExceptions: true, showStack: true })); 
        app.use((err, req, res, next) => {
            console.log('wow error');
        })

        app.get("/", (req: Request, res: Response, next: NextFunction) => {
            console.log(`auth: ${this.authorize(req)}`);

            this.send(res, {
                'hello': 'world',
                'sdfsdf': 'sdfsdfsdf'
            });
        });
        app.get('/api/available-time', async (req: Request, res: Response, next: NextFunction) => {
            //console.log(`request: ${req.originalUrl}, query: ${JSON.stringify(req.query)}`);
            try {
                if(!this.authorize(req))
                    throw new Error();

                let current = new Date();
                let now_hour = current.getHours();

                if(now_hour < 14 || now_hour > 19)
                    now_hour = 14;

                let now_minute = current.getMinutes();

                let times = await database.getAvailableTime();

                let res_times: AvailableTimesType = [];

                for(let i=0; i<times.length; i++) {
                    let t = times[i].time;
                    let hours = Number(t.substring(0, 2));
                    let minutes = Number(t.substring(3));
                    //if(hours*100 + minutes < now_hour*100 + now_minute)
                    //    continue;

                    if(!(hours == now_hour || (hours == now_hour+1 && minutes == 0)))
                        continue;

                    res_times.push(times[i]);
                }

                this.send(res, {
                    'times': res_times
                });
            }
            catch(e) {
                console.log(e);
                this.send(res, {
                    'ok': false
                })
            }

            next();
        });
        app.get('/api/get-inventory/:name', async (req: Request, res: Response, next: NextFunction) => {
            try {
                if(!this.authorize(req))
                    throw new Error();

                const name: string = req.params.name as string;

                let item = await database.getInventoryByName(name);
                this.send(res, item);
            }
            catch(e) {
                console.log(e);
                this.send(res, {
                    'ok': false
                });
            }

            next();
        });
        app.get('/api/get-inventory', async (req: Request, res: Response, next: NextFunction) => {
            try {
                if(!this.authorize(req))
                    throw new Error();

                let items = await database.getInventory();

                this.send(res, {
                    'items': items
                })
            }
            catch(e) {
                console.log(e);
                this.send(res, {
                    'ok': false
                });
            }

            next();
        });
        app.post('/api/request-payment', async (req: Request, res: Response, next: NextFunction) => {
            try {
                if(!this.authorize(req))
                    throw new Error();

                const name: string = req.body.name as string;
                const count: number = req.body.count as number;
                const reservation_time: string = req.body.reservation_time as string;
                const money: number = req.body.money as number;
                const phone: string = req.body.phone as string;
                const order: any[] = req.body.order as any[];

                if(count > 5)
                    throw new Error();

                let request_count = 0;

                for(let i=0; i<order.length; i++) {
                    let product_id: string = order[i].product_id as string;
                    let count: number = order[i].count as number;

                    if(product_id == 'profit')
                        throw new Error();

                    console.log(`product id: ${product_id}, count: ${count}`);

                    if(['bighead', 'medium', 'big'].includes(product_id))
                        request_count += count;
                }

                if(count != request_count)
                    throw new Error();

                let query_res = await database.requestPayment(name, count, reservation_time, money, phone, order);

                this.send(res, query_res);

                // 키오스크로 콜백 날리기

                dashboardSet.forEach(async d => {
                    await d.onInventoryChanged();
                });

                dashboardSet.forEach(d => {
                    d.onRequestPayment({
                        name: name,
                        count: count,
                        reservation_time: reservation_time,
                        money: money,
                        phone: phone,
                        ticket_id: query_res.ticket_id,
                        order: order
                    })
                });
            }
            catch(e) {
                console.log(e);

                this.send(res, {
                    'ok': false,
                    'ticket_id': -1
                });
            }

            next();
        })

        app.get('/api/ticket-info/:id', async (req: Request, res: Response, next: NextFunction) => {
            try {
                if(!this.authorize(req))
                    throw new Error();

                const id: number = req.params.id as unknown as number;

                let query_res = await database.getTicketInfo(id);
                this.send(res, query_res);
            }
            catch(e) {
                console.log(e);
                this.send(res, {'ok': false});
            }

            next();
        })

        app.get('/api/getUnallowedTicket', async (req: Request, res: Response, next: NextFunction) => {
            try {
                if(!this.authorize(req))
                    throw new Error();

                let query_res = await database.getUnallowedPayment();

                this.send(res, {list: query_res});
            }
            catch(e) {
                console.log(e);
                this.send(res, {'ok': false});
            }

            next();
        })

        app.get('/api/getReserver/:time', async (req: Request, res: Response, next: NextFunction) => {
            try {
                if(!this.authorize(req))
                    throw new Error();

                let query_res = await database.getReserver(req.params.time);

                this.send(res, {'list': query_res});
            }
            catch(e) {
                console.log(e);
                this.send(res, {'ok': false});
            }
            
            next();
        })

        app.get('/api/setNoshow/:id', async (req: Request, res: Response, next: NextFunction) => {
            try {
                if(!this.authorize(req))
                    throw new Error();

                await database.setNoshow(Number(req.params.id));
            }
            catch(e) {
                console.log(e);
                this.send(res, {'ok': false});
            }
        })

        app.get('/api/modifyMaxPeople/:time/:count', async (req: Request, res: Response, next: NextFunction) => {
            try {
                if(!this.authorize(req))
                    throw new Error();

                await database.modifyMaxPeople(req.params.time, Number(req.params.count));

                this.send(res, {'ok': true});
            }
            catch(e) {
                console.log(e);
                this.send(res, {'ok': false});
            }
        })
    }
}

// class RedirectRouter {
//     public setRoute(app: Express) {
//         app.get('/', (req: Request, res: Response, next: NextFunction) => {
//             res.send('<html><meta http-equiv="refresh" content="0; url=https://mafia.ssib.al/"></meta></html>');
//         });
//     }
// }

export { Router/*, RedirectRouter*/ };