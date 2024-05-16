import Server from './Server';
import {Router} from './Router';

console.log('Kiosk Server v1.0');

let server = new Server(12345, new Router());
server.run();

let server2 = new Server(6003, new Router());
server2.run();

console.log('Server started.');

process.on('uncaughtException', function(err) {
    console.log('Caught exception: ' + err);
});