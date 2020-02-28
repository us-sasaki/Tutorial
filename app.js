"use strict";

const express = require("express");
const Routes = require("./routes");
const Websock = require("./websock");

// express
const app = express();

// Server listening on port 80
app.use(express.static('public'));
app.use(express.json());
//app.use(express.urlencoded({ extended: true }));

// Application endpoints
const routes = new Routes(app);

const port = process.env.PORT || 8080;
const server = app.listen(port);

// set Websocket server
const websock = new Websock(server, routes);

console.log(`node-uslineapp started on port `+port);

