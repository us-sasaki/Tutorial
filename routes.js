"use strict";

module.exports = function(app) {
    /**
     * サービス内容
     *
     */
    app.route("/").get(function(req, res) {
		res.json( { "message" : {name: "value"}});
    });

    // Health check
    app.route("/health").get(function(req, res) {
        res.json({ "status" : "UP" });
    });

    // Environment variables
    app.route("/environment").get(function(req, res) {
        res.json({
            "PORT" : process.env.PORT
        });
    });

    const STATIC_FILES = ["/html/index.html", "/images/kesiki2003_8_30.jpg"];
    // static image
    STATIC_FILES.forEach( (loc) => {
        app.route(loc).get( (req, res) => {
            res.sendFile(loc, { root: __dirname })
        });
    });
};

