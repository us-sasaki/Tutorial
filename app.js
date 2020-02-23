"use strict";

const express = require("express");
const app = express();

// Application endpoints
const routes = require("./routes");
routes(app);

// Server listening on port 80
app.use(express.json());
const port = process.env.PORT || 8080;
const server = app.listen(port);

// set Websocket server
const websock = require("./websock");
websock(server);

console.log(`node-uslineapp started on port `+port);

