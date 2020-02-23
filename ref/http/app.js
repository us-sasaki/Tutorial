'use strict';

/**
 * Heroku 用簡易 Web サーバ(http 利用)
 * 
 * @author  Yusuke Sasaki
 */
// http モジュール読込
const http = require('http');
const path = require('path');
const fs = require('fs');

let lastRequested = [];

// サーバ構築
const server = http.createServer(function (request, response) {
    // リクエストを受けた時の処理

    //
    if (request.method === 'GET') {
        // GET 時の処理
        response.writeHead(200, {'Content-Type': 'text/plain'});
        response.write('last requested:\r\n');
        for (let i = 0; i < lastRequested.length; i++) {
            response.write('No.' + i);
            response.write(lastRequested[i]);
            response.write('\r\n');
        }
        response.end(); // レスポンス送信を完了する
    } else if (request.method === 'POST') {
        // POST 時の処理
        response.writeHead(200, {'Content-Type': 'text/plain'});
        let postData = '';
        request.on('data', (chunk) => {
            postData += chunk;
        }).on('end', () => {
            lastRequested.push(postData);
            response.end('あなたが送信したのは、'+postData);
        })
    }
});

// サーバ起動
server.listen(process.env.PORT || 8080);  //8080番ポートで待ち受け
