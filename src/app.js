const express = require("express");
const cors = require("cors");
require("dotenv").config();

const studentRoutes = require("./routes/students.routes");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.status(200).json({ status: "UP" }));
app.use("/students", studentRoutes);

module.exports = app;
