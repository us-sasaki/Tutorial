"use strict";

const { Client, BasicAuth } = require("@c8y/client");

module.exports = function(app) {
    /**
     * サービス内容
     *
     * measurement 取得を行う(pageSize=2)
     */
    app.route("/").get(function(req, res) {
    	const auth = new BasicAuth({
    		user: process.env.C8Y_USER, //process.env.C8Y_BOOTSTRAP_USER,
    		password: process.env.C8Y_PASSWORD, //process.env.C8Y_BOOTSTRAP_PASSWORD,
    		tenant: process.env.C8Y_TENANT //process.env.C8Y_BOOTSTRAP_TENANT
    	});
    	const baseUrl = process.env.C8Y_BASEURL;
    	const client = new Client(auth, baseUrl);
    	
    	(async () => {
    		try {
    			const { data, paging, resp } = await client.alarm.list({ pageSize: 2 });
    			res.json( { "message" : JSON.stringify(data[0]) } );
    		} catch (err) {
    			res.json( { "errorOcurredSasaki" : err } );
    		}
    	})();
    });

    // Health check
    app.route("/health").get(function(req, res) {
        res.json({ "status" : "UP" });
    });

    // Environment variables
    app.route("/environment").get(function(req, res) {
        res.json({
            "appName" : process.env.APPLICATION_NAME,
            "platformUrl" : process.env.C8Y_BASEURL,
            "microserviceIsolation" : process.env.C8Y_MICROSERVICE_ISOLATION,
            "tenant" : process.env.C8Y_BOOTSTRAP_TENANT,
            "bootstrapUser" : process.env.C8Y_BOOTSTRAP_USER,
            "bootstrapPassword" : process.env.C8Y_BOOTSTRAP_PASSWORD,
            "tenant" : process.env.C8Y_TENANT,
            "user" : process.env.C8Y_USER,
            "password" : process.env.C8Y_PASSWORD
//            ,"kv" : keyValue(process.env)
//            ,"headers" : keyValue(req.headers)
        });
    });
};

function keyValue(env) {
	let r = "";
	Object.keys(env).forEach( (data) => { r = r + "{"+data+":"+env[data]+"}"; });
	return r;
}

function retrieveServiceClient() {
    // まず、bootstrap user による Client を生成する
    const auth = new BasicAuth({
        user: process.env.C8Y_USER, //process.env.C8Y_BOOTSTRAP_USER,
        password: process.env.C8Y_PASSWORD, //process.env.C8Y_BOOTSTRAP_PASSWORD,
        tenant: process.env.C8Y_TENANT //process.env.C8Y_BOOTSTRAP_TENANT
    });
    const baseUrl = process.env.C8Y_BASEURL;
    const client = new Client(auth, baseUrl);

    

}
