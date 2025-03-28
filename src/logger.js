const config = require("./config.js");
const fetch = require("node-fetch");

function sendLogToGrafana({
  level = "info",
  type = "app",
  stream = {},
  message = {},
  metadata = {},
}) {
  const timestamp = `${Date.now()}000000`;
  const log = {
    streams: [
      {
        stream: {
          component: config.logging.source,
          level,
          type,
          ...stream,
        },
        values: [[timestamp, JSON.stringify(message), metadata]],
      },
    ],
  };

  fetch(config.logging.url, {
    method: "POST",
    body: JSON.stringify(log),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.logging.userId}:${config.logging.apiKey}`,
    },
  }).catch(() => {}); // Silent fail
}

function sanitizeBody(body) {
  if (!body || typeof body !== "object") return body;
  const clone = { ...body };
  if (clone.password) clone.password = "****";
  return clone;
}

function httpLogger(req, res, next) {
  const start = process.hrtime();
  const hasAuth = !!req.headers["authorization"];

  res.on("finish", () => {
    const duration = process.hrtime(start);
    const latencyMs = Math.round(duration[0] * 1000 + duration[1] / 1e6);

    sendLogToGrafana({
      level: "info",
      type: "http",
      stream: { method: req.method, path: req.originalUrl },
      message: {
        status: res.statusCode,
        hasAuth,
        requestBody: sanitizeBody(req.body),
        responseTime: `${latencyMs}ms`,
      },
    });
  });

  next();
}

function logDbQuery(sql, params) {
  sendLogToGrafana({
    level: "info",
    type: "db",
    message: {
      query: sql,
      params,
    },
  });
}

function logFactoryRequest(url, payload, response, success) {
  sendLogToGrafana({
    level: success ? "info" : "error",
    type: "factory",
    stream: { endpoint: url },
    message: {
      request: sanitizeBody(payload),
      response,
    },
  });
}

function logUnhandledError(err, context = {}) {
  sendLogToGrafana({
    level: "error",
    type: "exception",
    message: {
      message: err.message,
      stack: err.stack,
      ...context,
    },
  });
}

module.exports = {
  sendLogToGrafana,
  httpLogger,
  logDbQuery,
  logFactoryRequest,
  logUnhandledError,
};
