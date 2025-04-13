const express = require("express");
const { authRouter, setAuthUser } = require("./routes/authRouter.js");
const orderRouter = require("./routes/orderRouter.js");
const franchiseRouter = require("./routes/franchiseRouter.js");
const version = require("./version.json");
const config = require("./config.js");
const metrics = require("./metrics.js");
const logger = require("./logger.js");

const app = express();
app.use(express.json());
app.use(setAuthUser);
app.use(metrics.requestTracker()); // track middleware before routes
app.use(logger.httpLogger); // logging

const allowedOrigins = ["https://pizza.tylerhiattdev.click"];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({ message: "CORS error: Origin not allowed" });
  }
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  next();
});

const apiRouter = express.Router();
app.use("/api", apiRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/order", orderRouter);
apiRouter.use("/franchise", franchiseRouter);

apiRouter.use("/docs", (req, res) => {
  res.json({
    version: version.version,
    endpoints: [
      ...authRouter.endpoints,
      ...orderRouter.endpoints,
      ...franchiseRouter.endpoints,
    ],
    config: { factory: config.factory.url, db: config.db.connection.host },
  });
});

app.get("/", (req, res) => {
  res.json({
    message: "welcome to JWT Pizza",
    version: version.version,
  });
});

app.use("*", (req, res) => {
  res.status(404).json({
    message: "unknown endpoint",
  });
});

app.use((err, req, res, next) => {
  logger.logUnhandledError(err, {
    path: req.originalUrl,
    method: req.method,
    user: req.user?.id,
  });

  res
    .status(err.statusCode ?? 500)
    .json({ message: err.message, stack: err.stack });
  next();
});

module.exports = app;
