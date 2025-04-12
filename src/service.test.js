const request = require("supertest");
const app = require("./service.js");
const version = require("./version.json");
const { stopMetricsCollection } = require("./metrics.js");

beforeAll(() => {
  jest.mock("./metrics.js", () => ({
    requestTracker: () => (req, res, next) => next(),
    stopMetricsCollection: jest.fn(),
    trackAuthAttempt: jest.fn(),
    trackPizzaOrder: jest.fn(),
    sendMetricToGrafana: jest.fn(),
  }));
});

afterAll(() => {
  stopMetricsCollection();
});

describe("Service Tests", () => {
  test("Root endpoint should return welcome message", async () => {
    const res = await request(app).get("/");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: "welcome to JWT Pizza",
      version: version.version,
    });
  });

  test("API docs endpoint should return version and endpoints", async () => {
    const res = await request(app).get("/api/docs");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("version", version.version);
    expect(res.body).toHaveProperty("endpoints");
    expect(Array.isArray(res.body.endpoints)).toBe(true);
    expect(res.body).toHaveProperty("config");
  });

  test("Unknown route should return 404 error", async () => {
    const res = await request(app).get("/random");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "unknown endpoint" });
  });

  test("CORS headers should be set", async () => {
    const res = await request(app).options("/api/auth");

    expect(res.headers["access-control-allow-methods"]).toContain("GET");
    expect(res.headers["access-control-allow-headers"]).toContain(
      "Authorization"
    );
  });

  test("Error handler should return 500 for internal server errors", async () => {
    const errorApp = require("express")();
    errorApp.use((req, res, next) => {
      const err = new Error("Test error");
      err.statusCode = 500;
      next(err);
    });
    errorApp.use(app._router); // Attach the service.js router

    const res = await request(errorApp).get("/");

    expect(res.status).toBe(500);
  });
});
