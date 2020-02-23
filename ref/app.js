"use strict";

require("dotenv").config();
const express = require("express");
const app = express();

// Application endpoints
const routes = require("./routes");
routes(app);

// Server listening on port 80
app.use(express.json());
app.listen(80);
console.log(`node-microservice started on port 80`);

