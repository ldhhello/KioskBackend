import {ConnectionPool, connectionPool} from './ConnectionPool';

type AvailableTimesType = {
    time: string,
    max_people: number,
    now_people: number
}[];

type InventoryType = {
    name: string,
    count: number
};

type RequestPaymentType = {
    ticket_id: number
};

type OrderType = {
    product_id: string,
    count: number
};

type TicketInfoType = {
    id: number,
    created_time: number,
    created_time_str: string,
    owner_name: string,
    phone: string,
    order: OrderType[],
    allowed: boolean
};

type ReserveType = {
    id: number,
    time: string,
    name: string,
    phone: string,
    allowed: boolean,
    order: OrderType[]
}

class Database {
    constructor() {

    }

    public async getAvailableTime() {
        let query = await connectionPool.query(`
            select timetbl.time as 'time', timetbl.max_people as 'max_people', count(reservetbl.ticket) as 'now_people' from timetbl
                left outer join reservetbl on timetbl.time = reservetbl.time
                group by timetbl.time;`, []
        );

        if(query === undefined)
            throw new Error();

        let times: AvailableTimesType = [];

        for(let i=0; i<query.length; i++) {
            times[i] = {
                time: query[i].time,
                max_people: query[i].max_people,
                now_people: query[i].now_people
            }
        }

        return times;
    }

    public async getInventory() {
        let query = await connectionPool.query('select * from inventorytbl', []);
        if(query === undefined)
            throw new Error();

        let items: InventoryType[] = [];

        for(let i=0; i<query.length; i++) {
            items[i] = {
                name: query[i].name,
                count: query[i].count
            }
        };

        return items;
    }

    public async getInventoryByName(name: string) {
        let query = await connectionPool.query('select * from inventorytbl where name = ?', [name]);
        if(query === undefined || query.length < 1)
            throw new Error();

        let res: InventoryType = {
            name: query[0].name,
            count: query[0].count
        }

        return res;
    }

    public async requestPayment(name: string, count: number, reservation_time: string, money: number, phone: string, order: any[]) {
        let transaction: any[] = [];
        let ticket_id = Math.floor(Math.random() * 8999999) + 1000000;

        // 남은 자리 수보다 요청한 자리 수가 더 많으면 오류
        transaction.push({
            str: `
                select case when (
                    select timetbl.max_people - count(reservetbl.ticket) >= ? as 'valid' from timetbl
                        left outer join reservetbl on timetbl.time = reservetbl.time
                        where timetbl.time = ?
                        group by timetbl.time
                ) then 'ok' else f_raise('full') end;
            `,
            values: [count, reservation_time]
        });

        // 티켓 발급
        transaction.push({
            str: 'insert into tickettbl (id, created_time, owner_name, phone_number, money) values (?, now(), ?, ?, ?)',
            values: [ticket_id, /*now(),*/ name, phone, money]
        });

        for(let i=0; i<order.length; i++) {
            let product_id: string = order[i].product_id as string;
            let count: number = order[i].count as number;

            if(count == 0)
                continue;

            // 인벤토리 수정
            transaction.push({
                str: 'update inventorytbl set count=count-? where name = ?', 
                values: [count, product_id]
            });
            // 주문서 추가
            transaction.push({
                str: 'insert into ordertbl (ticket, product_id, count) values (?, ?, ?)',
                values: [ticket_id, product_id, count]
            });
        }

        // 여기서 해야되는게
        // 1. count 검증 (db X)
        // 2. reservation_time에 count만큼 남은 자리가 있는지 검증
        // 3. money 검증 (db X)
        // 4. 재고가 있는지 검증
        
        // 재고가 충분하고, 예약 요청 시간에 count만큼 자리가 남는다면 예약을 진행한다!
        // 1. 재고 db에서 값을 차감한다
        // /*2. time db에서 값을 차감한다*/
        // 3. 티켓 db에 값을 추가한다
        // 4. 주문 db에 값을 추가한다

        // 주문 인원수만큼 예약 추가
        for(let i=0; i<count; i++) {
            transaction.push({
                str: 'insert into reservetbl (time, ticket) values (?, ?)',
                values: [reservation_time, ticket_id]
            });
        }

        await connectionPool.query_transaction(transaction);

        return {ticket_id: ticket_id} as RequestPaymentType;
    }

    public async getTicketInfo(id: number) {
        let query = await connectionPool.query('select * from tickettbl where id = ?', [id]);
        if(query === undefined)
            throw new Error();

        let query2 = await connectionPool.query(`
            select tickettbl.id as id, ordertbl.product_id as product_id, ordertbl.count as count from tickettbl
                inner join ordertbl on tickettbl.id = ordertbl.ticket
                where id = ?;
        `, [id]);

        let order: OrderType[] = [];

        for(let i=0; i<query2.length; i++) {
            order.push({
                'product_id': query2[i].product_id,
                'count': query2[i].count
            });
        }

        let res: TicketInfoType = {
            id: id,
            created_time: query[0].created_time.getTime(),
            created_time_str: query[0].created_time.toString(),
            owner_name: query[0].owner_name,
            phone: query[0].phone_number,
            order: order,
            allowed: query[0].allowed ? true : false
        };
        console.log(JSON.stringify(res));

        return res;
    }

    public async confirmPayment(id: number) {
        // 주문서를 컨펌한다

        await connectionPool.query('update tickettbl set allowed=1 where id = ?', [id]);

        let query = await connectionPool.query('select money from tickettbl where id = ?', [id]);
        let money = query[0].money;
        if(money === undefined)
            throw new Error();

        await this.addProfit(money);
    }

    public async cancelPayment(id: number, deleteTicket?: boolean) {
        // 주문서를 읽으며 인벤토리를 원래대로 돌린다
        // 티켓을 지운다
        // 다른거 다 on delete cascade 돼있어서 저렇게만 하면 됨!

        if(deleteTicket === undefined)
            deleteTicket = true;

        let ticketInfo = await this.getTicketInfo(id);

        let transaction: any[] = [];

        for(let i=0; i<ticketInfo.order.length; i++) {
            let order: OrderType = ticketInfo.order[i];
            
            transaction.push({
                str: 'update inventorytbl set count=count+? where name = ?',
                values: [order.count, order.product_id]
            });
        }

        if(deleteTicket)
            transaction.push({
                str: 'delete from tickettbl where id = ?',
                values: [id]
            });

        await connectionPool.query_transaction(transaction);
    }

    public async getUnallowedPayment() {
        let query = await connectionPool.query('select id from tickettbl where allowed = 0', []);
        if(query === undefined)
            throw new Error();

        let res: TicketInfoType[] = [];

        for(let i=0; i<query.length; i++) {
            res.push(await this.getTicketInfo(query[i].id));
        }

        return res;
    }

    public async getReserver(time: string) {
        let query = await connectionPool.query(`
            select reservetbl.ticket as id, reservetbl.time as time, tickettbl.owner_name as name, 
	            tickettbl.phone_number as phone, tickettbl.allowed as allowed from reservetbl
	            inner join tickettbl on reservetbl.ticket = tickettbl.id
	            where reservetbl.time = ?;`, [time]);
        if(query === undefined)
            throw new Error();

        let res: ReserveType[] = [];

        for(let i=0; i<query.length; i++) {
            let ticketinfo = await this.getTicketInfo(query[i].id);

            res.push({
                id: query[i].id,
                time: query[i].time,
                name: query[i].name,
                phone: query[i].phone,
                allowed: query[i].allowed ? true : false,
                order: ticketinfo.order
            });
        }

        return res;
    }

    public async addProfit(money: number) {
        let query = await connectionPool.query('update inventorytbl set count=count+? where name = "profit"', [money]);
        if(query === undefined)
            throw new Error();
    }

    public async modifyInventory(name: string, count: number) {
        //console.log('name: ' + name + ', count: ' + count);
        let query = await connectionPool.query('update inventorytbl set count=count+? where name = ?', [count, name]);
        if(query === undefined)
            throw new Error();
    }

    public async setNoshow(id: number) {
        // 재고는 원상복구, 매출은 그대로 유지해야 함!
        this.cancelPayment(id, false);
    }

    public async modifyMaxPeople(time: string, count: number) {
        let query = await connectionPool.query('update timetbl set max_people=? where time = ?', [count, time]);
        if(query === undefined)
            throw new Error();
    }
};

let database = new Database();

export {Database, database, AvailableTimesType, InventoryType};