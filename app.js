'use strict';

/**
 * Heroku 用簡易 Web サーバ(http 利用)
 * 
 * @author  Yusuke Sasaki
 */
// http モジュール読込
const http = require('http');

let lastRequested = {};

// サーバ構築
const server = http.createServer(function (request, response) {
    // リクエストを受けた時の処理
    // レスポンスヘッダ
    response.writeHead(200, {'Content-Type': 'text/plain'});

    //
    if (request.method === 'GET') {
        // GET 時の処理
        response.write('last requested:\r\n');
        response.write(JSON.stringify(lastRequested));
        response.end(); // レスポンス送信を完了する
    } else if (request.method === 'POST') {
        // POST 時の処理
        let postData = '';
        request.on('data', (chunk) => {
            postData += chunk;
        }).on('end', () => {
            response.end('あなたが送信したのは、'+postData);
        })
    }
});

// サーバ起動
server.listen(process.env.PORT || 8080);  //8080番ポートで待ち受け
