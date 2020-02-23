"use strict";

module.exports = function(server) {
    /**
     * WebSocket サービス
     */
    const { Server } = require('ws');
    console.log("server="+server);
    const wss = new Server({ server });
    wss.on('connection', (ws) => {
        console.log('Client connected');
        ws.on('close', () => console.log('Client disconnected'));
    });

    // server push
    setTimeout( () => {
        wss.clients.forEach((client) => {
            client.send(new Date().toTimeString());
        });
        console.log('pushed to wss clients '+new Date().toTimeString());
    }, 1000);
};

