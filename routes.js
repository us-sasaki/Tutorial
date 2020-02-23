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

    const IMAGE_FILE = "/images/kesiki2003_8_30.jpg";
    // static image
    app.route(IMAGE_FILE).get( (req, res) => {
        res.sendFile(IMAGE_FILE, { root: __dirname })
    });
};

