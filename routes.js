"use strict";

const path = require('path');
const multer = require('multer');
const lineVerify = require('./verify.js');
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
            const f = req.file.originalname;
            const ext = path.extname(f).substring(1);
            if (ALLOWED_FILETYPE.includes(ext)) {
                res.send(f + 'ファイルのアップロードが完了しました。');
            } else {
                res.send(f + 'は許容されないファイル種別です。許容されるもの'+ALLOWED_FILETYPE);
            }
        });

        //
        // webhook for LINE
        //
        this.receiveMessage = function() {
            return new Promise( (res, rej) => {
                this.messageCallback = function(msg) { res(msg) };
            });
        };
        app.route('/notify').post( async (req, res) => {
            if (!lineVerify(req)) {
                res.json({response: "verification error"});
            }
            if (this.websocket !== null) {
                console.log("notifying");
                this.websocket.notify(JSON.stringify(req.body));
                const msg = await this.receiveMessage();
                console.log("msg="+msg);
                res.json({response: JSON.parse(msg)});
            }
        });
        app.route('/notify').get( (req, res) => {
            res.json({});
        });

    }

/*------------------
 * instance methods
 */
    setWebSocket(websocket) {
        this.websocket = websocket;
        console.log("setWebSocket:"+websocket);
    }

    /**
     * WebSocket からメッセージを受信したときに非同期に呼ばれます
     * 
     * @param {string} message
     */
    messageReceived(message) {
        console.log("received: "+message);
        if (this.messageCallback) {
            this.messageCallback(message);
            console.log("sent message: "+message);
        }
    }

};

