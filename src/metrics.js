const os = require("os");
const { metrics } = require("./config");

// In-memory storage for tracking metrics
const metrics_dict = {
  requestsByMethod: { GET: 0, POST: 0, PUT: 0, DELETE: 0 },
  activeUsers: 0,
  authAttempts: { success: 0, fail: 0 },
  system: { memoryPercentage: 0, cpuPercentage: 0 },
  pizzas: { sold: 0, creationFailures: 0, revenue: 0 },
};

let metricsInterval; // storing ID so I can clear it in the tests to prevent from running indefinitely

// Middleware to track HTTP requests
function requestTracker() {
  return (req, res, next) => {
    // console.log("Entered requestTracker");
    const start = process.hrtime();

    res.on("finish", () => {
      const duration = process.hrtime(start);
      const latencyMs = duration[0] * 1000 + duration[1] / 1e6;

      metrics_dict.requestsByMethod[req.method] += 1;
      sendMetricToGrafana("service_latency_ms", latencyMs, {
        endpoint: req.originalUrl,
        method: req.method,
      });

      //   console.log(
      //     `Tracked HTTP request: ${req.method} ${req.originalUrl} (${latencyMs} ms)`
      //   );
    });

    next();
  };
}

// Track authentication attempts
function trackAuthAttempt(success) {
  const status = success ? "success" : "fail";
  metrics_dict.authAttempts[status] += 1;

  sendMetricToGrafana("auth_attempts_total", 1, { status });
  if (success) metrics_dict.activeUsers += 1; // Increment for successful logins
}

// Track user logout
function trackUserLogout() {
  if (metrics_dict.activeUsers > 0) metrics_dict.activeUsers -= 1;
}

// Track pizza orders & revenue
function trackPizzaOrder(success, count, revenue) {
  if (success) {
    metrics_dict.pizzas.sold += count;
    metrics_dict.pizzas.revenue += revenue;
  } else {
    metrics_dict.pizzas.creationFailures += 1;
  }
}

function startMetricsCollection() {
  if (!metricsInterval) {
    // Periodically send metrics to Grafana
    metricsInterval = setInterval(() => {
      // console.log("SENDING METRICS TO GRAFANA...");

      // Send HTTP Request Counts
      Object.keys(metrics_dict.requestsByMethod).forEach((method) => {
        sendMetricToGrafana(
          "http_requests_total",
          metrics_dict.requestsByMethod[method],
          { method }
        );
        metrics_dict.requestsByMethod[method] = 0; // Reset after sending
      });

      // Send Active Users
      sendMetricToGrafana("active_users", metrics_dict.activeUsers);

      // Send Auth Attempts
      Object.keys(metrics_dict.authAttempts).forEach((status) => {
        sendMetricToGrafana(
          "auth_attempts_total",
          metrics_dict.authAttempts[status],
          { status }
        );
        metrics_dict.authAttempts[status] = 0; // Reset each status count
      });

      // Send System Metrics
      metrics_dict.system.cpuPercentage =
        (os.loadavg()[0] / os.cpus().length) * 100;
      metrics_dict.system.memoryPercentage =
        ((os.totalmem() - os.freemem()) / os.totalmem()) * 100;
      sendMetricToGrafana("cpu_percentage", metrics_dict.system.cpuPercentage);
      sendMetricToGrafana(
        "memory_percentage",
        metrics_dict.system.memoryPercentage
      );

      // Send Pizza Metrics
      sendMetricToGrafana("pizza_sold_total", metrics_dict.pizzas.sold);
      sendMetricToGrafana(
        "pizza_creation_failures_total",
        metrics_dict.pizzas.creationFailures
      );
      sendMetricToGrafana(
        "revenue_total",
        Math.round(metrics_dict.pizzas.revenue * 100)
      ); // Convert to cents
      metrics_dict.pizzas.sold =
        metrics_dict.pizzas.creationFailures =
        metrics_dict.pizzas.revenue =
          0;
    }, 30000); // Send every 30 seconds
  }
}

function stopMetricsCollection() {
  // needed for tests to run
  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
  }
}

// Function to send metrics to Grafana
function sendMetricToGrafana(metricName, metricValue, attributes = {}) {
  attributes = { ...attributes, source: metrics.source };

  const metric = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics: [
              {
                name: metricName,
                unit: "1",
                sum: {
                  dataPoints: [
                    {
                      asInt: Number.isInteger(metricValue)
                        ? metricValue
                        : undefined,
                      asDouble: !Number.isInteger(metricValue)
                        ? metricValue
                        : undefined,
                      timeUnixNano: Date.now() * 1000000,
                      attributes: Object.keys(attributes).map((key) => ({
                        key: key,
                        value: { stringValue: attributes[key] },
                      })),
                    },
                  ],
                  aggregationTemporality: "AGGREGATION_TEMPORALITY_CUMULATIVE",
                  isMonotonic: true,
                },
              },
            ],
          },
        ],
      },
    ],
  };

  fetch(`${metrics.url}`, {
    method: "POST",
    body: JSON.stringify(metric),
    headers: {
      Authorization: `Bearer ${metrics.apiKey}`,
      "Content-Type": "application/json",
    },
  }).catch(() => {});
}

module.exports = {
  requestTracker,
  trackAuthAttempt,
  trackUserLogout,
  trackPizzaOrder,
  sendMetricToGrafana,
  startMetricsCollection,
  stopMetricsCollection,
};
