"use strict";

const express = require("express");
const app = express();

// Application endpoints
const routes = require("./routes");
routes(app);

// Server listening on port 80
app.use(express.json());
app.listen(process.env.PORT || 8080);
console.log(`node-uslineapp started on port `);

