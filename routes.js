"use strict";

const path = require('path');
const multer = require('multer');
const ALLOWED_FILETYPE = ["html", "jpg"];

/**
 * サービスを設定
 */
module.exports = class {

/*-------------
 * constructor
 */
    constructor(app) {
        this.app = app;
        
        app.route("/").get(function(req, res) {
            res.json( { message: {name: "value"}});
        });

        // Health check
        app.route("/health").get(function(req, res) {
            res.json({ status: "UP" });
        });

        // Environment variables
        app.route("/environment").get(function(req, res) {
            res.json({ port: process.env.PORT });
        });

        // /html/ 配下の *.html ファイル
        // /images/ 配下の *.jpg ファイル は静的ファイルとして公開
        const fs = require('fs');
        ALLOWED_FILETYPE.forEach( (dir) => {
            fs.readdir(dir, (err, files) => {
                if (err) throw err;
                files.filter( (file) => {
                    // 拡張子が dir で終わるファイルのみに filter
                    return fs.statSync(dir+"/"+file).isFile() && file.toString().endsWith("."+dir);
                }).forEach( (file) => this.addStaticResource(file) );
            });
        });

        // File upload
        const storage = multer.diskStorage({
            destination: (req, file, cb) => { cb(null, 'jpg/')},
            filename: (req, file, cb) => {cb(null, file.originalname) }
        });
        const upload = multer({ storage: storage });
        // app.use(express.static(path.join(__dirname, 'public')));
        app.post('/upload', upload.single('file'), (req, res) => {
            if (this.addStaticResource(req.file.originalname)) {
                res.send(req.file.originalname + 'ファイルのアップロードが完了しました。');
            } else {
                res.send(req.file.originalname +
                    'は許容されないファイル種別です。許容されるもの'+ALLOWED_FILETYPE);
            }
        });

    }

/*------------------
 * instance methods
 */
    addStaticResource(file) {
        // 許可された拡張子以外は無視
        const ext = path.extname(file).substring(1);
        if (!ALLOWED_FILETYPE.includes(ext)) return false;

        // ファイルpath
        const p = "/"+ext+"/"+file;

        this.app.route(p).get( (req, res) => {
            res.sendFile(p, { root: __dirname })
        });
        return true;
    }

};

