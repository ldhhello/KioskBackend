import mysql from 'mysql2/promise';

class ConnectionPool {
    private pool: mysql.Pool;

    constructor() {
        this.pool = mysql.createPool(require('./connection-info.json'));
    }

    public async query(str: string, values: any, redo?: boolean) {
        if(redo === undefined)
            redo = true;

        let connection = await this.pool.getConnection();

        try {
            let data = await connection.query(str, values);

            return data[0] as any[];
        }
        catch(e) {
            console.log(e);
            
            if(redo)
                return this.query(str, values, false);
            else
                return;
        }
        finally {
            connection.release();
        }
    }

    public async query_transaction(queries: {str: string, values: any}[]) {
        let connection = await this.pool.getConnection();

        this.query('select 1', []);
        
        try {
            let res: any[] = [];

            await connection.beginTransaction();

            for(let i=0; i<queries.length; i++) {
                res = await connection.query(queries[i].str, queries[i].values);
            }

            await connection.commit();
        }
        catch(e) {
            console.log(e);

            await connection.rollback();
            throw e;
        }
        finally {
            connection.release();
        }
    }
}

let connectionPool: ConnectionPool = new ConnectionPool();

export {ConnectionPool, connectionPool};