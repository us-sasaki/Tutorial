"use strict";

const crypto = require("crypto");

function validate_signature(signature, body) {
    const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
    return signature == crypto.createHmac('sha256', LINE_CHANNEL_SECRET).update(Buffer.from(JSON.stringify(body))).digest('base64');
}

module.exports = function(req) {
    console.log('Node.js HTTP trigger function processed a request. RequestUri=%s', req.originalUrl);

    return validate_signature(req.header('x-line-signature'), req.body);
};
