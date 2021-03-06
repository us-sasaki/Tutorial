"use strict";

const { Server } = require('ws');

/**
 * WebSocket Server
 */
module.exports = class {
    
    constructor(server, routes) {
        this.routes = routes;
        routes.setWebSocket(this);

        /**
         * WebSocket サーバー設定
         */
        this.wss = new Server({ server });
        this.wss.on('connection', (ws) => {
            console.log('heroku-uslineapp websock.js / Client connected');
            ws.on('message', (message) => {
                console.log("ws.on message");
                this.routes.messageReceived(message);
            });
            ws.on('close', () => console.log('Client disconnected'));
        });

        // server push
        setTimeout( () => { this.notify(new Date().toISOString()) }, 1000);
    }

    notify(message) {
        this.wss.clients.forEach( (client) => {
            client.send(message);
        });
        //console.log('heroku-uslineapp websocket.js / pushed to wss clients '+message);
    }

}

