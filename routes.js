"use strict";

const path = require('path');
const multer = require('multer');
const lineVerify = require('./lineverify.js');
const ALLOWED_FILETYPE = ['jpg', 'jpeg'];

/**
 * endpoint 設定
 */
module.exports = class {

/*-------------
 * constructor
 */
    constructor(app) {
        this.app = app;
        this.websocket = null;
        this.messageCallback = null;
        
        //
        // for test (/)
        //
        app.route("/").get( (req, res) => {
            res.json( { message: {name: "value"}});
        });

        // 
        // Health check (/health, always up)
        //
        app.route("/health").get( (req, res) => {
            res.json({ status: "UP" });
        });

        //
        // Environment variables (/environment)
        //
        app.route("/environment").get( (req, res) => {
            res.json({ port: process.env.PORT });
        });

        //
        // File upload (/upload)
        //
        const storage = multer.diskStorage({
            destination: (req, file, cb) => { cb(null, 'public/jpg/')},
            filename: (req, file, cb) => {cb(null, file.originalname) }
        });
        const upload = multer({ storage: storage });
        // app.use(express.static(path.join(__dirname, 'public')));
        app.post('/upload', upload.single('file'), (req, res) => {
            console.log('heroku-uslineapp upload requested. file: '+req.file.originalname);
            const f = req.file.originalname;
            const ext = path.extname(f).substring(1);
            if (ALLOWED_FILETYPE.includes(ext)) {
                res.send(f + 'ファイルのアップロードが完了しました。');
                console.log('heroku-uslineapp uploaded. file='+f);
            } else {
                res.send(f + 'は許容されないファイル種別です。許容されるもの'+ALLOWED_FILETYPE);
                console.log('heroku-uslineapp upload rejected. file='+f);
            }
        });

        //
        // webhook for LINE
        //
        // websock からの通知を受け取りの Promise 化
        this.receiveMessage = function() {
            return new Promise( (res, rej) => {
                this.messageCallback = function(msg) { res(msg) };
            });
        };
        app.route('/notify').post( async (req, res) => {
            console.log('heroku-uslineapp LINE-notify requested.');
            if (!lineVerify(req)) {
                // LINE 署名検証
                res.json({response: "LINE verification error"});
            }
            if (this.websocket !== null) {
                console.log("heroku-uslineapp start to notify websock clients.");
                this.websocket.notify(JSON.stringify(req.body));
                // websocket での通知を待つ
                const msg = await this.receiveMessage();
                console.log("heroku-uslineapp received from websock clients. msg="+msg);
                res.json({response: JSON.parse(msg)});
            }
        });
        app.route('/notify').get( (req, res) => {
            console.log('heroku-uslineapp GET /notify requested.');
            res.json({});
            console.log('heroku-uslineapp responded to GET /notify with empty data.');
        });
        
        //
        // webhook for Slack
        //
        app.route('/slack').post( async (req, res) => {
        	// slack 署名検証はスキップ
        	if (req.body.challenge) {
        		// 初期登録時の Slack での Request URL 検証対応
        		console.log('heroku-uslineapp renpond to url verification');
				res.setHeader('Content-Type', 'text/plain');
				res.send(req.body.challenge);
			} else if (this.websocket !== null) {
        		console.log("heroku-uslineapp start to notify websock clients.");
        		this.websocket.notify(JSON.stringify(req.body));
        		// websocket での通知を待つ
        		const msg = await this.receiveMessage();
                //console.log("heroku-uslineapp received from websock clients. msg="+msg);
        		res.json({response: JSON.parse(msg)});
        	} else {
                console.log('heroku-uslineapp notified from slack, but no alive websocks.');
            }
        });
    }

/*------------------
 * instance methods
 */
    setWebSocket(websocket) {
        this.websocket = websocket;
        console.log("heroku-uslineapp setWebSocket:"+websocket);
    }

    /**
     * WebSocket からメッセージを受信したときに非同期に呼ばれます
     * 
     * @param {string} message
     */
    messageReceived(message) {
        console.log("heroku-uslineapp received from WebSocket: "+message);
        if (this.messageCallback) {
            this.messageCallback(message);
            //console.log("heroku-uslineapp sent message to messageCallback: "+message);
        }
    }

};

