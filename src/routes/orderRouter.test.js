const request = require("supertest");
const app = require("../service");
const { Role, DB } = require("../database/database");

let adminUser;
let adminUserToken;

beforeAll(async () => {
  adminUser = await createAdminUser();
  adminUserToken = await loginTestUser(adminUser);

  jest.mock("../metrics", () => ({
    sendMetricToGrafana: jest.fn(),
    trackAuthAttempt: jest.fn(),
    trackPizzaOrder: jest.fn(),
  }));
});

describe("Order Router Tests", () => {
  test("Get menu items", async () => {
    const res = await request(app).get("/api/order/menu");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test("Add menu item as an admin", async () => {
    const menuItem = {
      title: randomName() + "Pizza",
      description: "Test pizza",
      image: "test-pizza.png",
      price: 9.99,
    };

    const res = await request(app)
      .put("/api/order/menu")
      .set("Authorization", `Bearer ${adminUserToken}`)
      .send(menuItem);

    expect(res.status).toBe(200);
    expect(res.body.some((item) => item.title === menuItem.title)).toBe(true);
  });

  test("Get orders for user", async () => {
    const order = await createTestOrder();

    const res = await request(app)
      .get("/api/order")
      .set("Authorization", `Bearer ${adminUserToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.orders)).toBe(true);
    expect(res.body.orders.some((o) => o.id === order.id)).toBe(true);
  });

  test("Create an order for a user", async () => {
    const order = await createTestOrder();

    expect(order).toHaveProperty("id");
    expect(order).toHaveProperty("items");
    expect(order.items.length).toBeGreaterThan(0);
  });

  test("Fail to get orders without authentication", async () => {
    const res = await request(app).get("/api/order");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("unauthorized");
  });

  test("Fail to add menu item as non-admin", async () => {
    const nonAdminUser = await createNonAdminUser();
    const nonAdminUserToken = await loginTestUser(nonAdminUser);

    const menuItem = {
      title: randomName() + "Pizza",
      description: "Unauthorized test pizza",
      image: "test-pizza.png",
      price: 1.99,
    };

    const res = await request(app)
      .put("/api/order/menu")
      .set("Authorization", `Bearer ${nonAdminUserToken}`)
      .send(menuItem);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("unable to add menu item");
  });

  test("Fail to fulfill order due to factory API error", async () => {
    const franchiseId = await createTestFranchise();
    const storeId = await createTestStore(franchiseId);
    const menuItem = await createTestMenuItem();

    const orderData = {
      franchiseId,
      storeId,
      items: [
        {
          menuId: menuItem.id,
          description: menuItem.title,
          price: menuItem.price,
        },
      ],
    };

    jest.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      json: jest
        .fn()
        .mockResolvedValue({ reportUrl: "http://mocked-failure-url.com" }),
    });

    const orderRes = await request(app)
      .post("/api/order")
      .set("Authorization", `Bearer ${adminUserToken}`)
      .send(orderData);

    expect(orderRes.status).toBe(500);
    expect(orderRes.body.message).toBe("Failed to fulfill order at factory");
    expect(orderRes.body.reportPizzaCreationErrorToPizzaFactoryUrl).toBe(
      "http://mocked-failure-url.com"
    );
  });
});

//// helper functions for unit tests ////
function expectValidJwt(potentialJwt) {
  expect(potentialJwt).toMatch(
    /^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/
  );
}

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

async function createAdminUser() {
  let user = { password: "toomanysecrets", roles: [{ role: Role.Admin }] };
  user.name = randomName();
  user.email = user.name + "@admin.com";

  user = await DB.addUser(user);
  return { ...user, password: "toomanysecrets" };
}

async function createNonAdminUser() {
  let user = { password: "toomanysecrets", roles: [{ role: Role.Diner }] };
  user.name = randomName();
  user.email = user.name + "@nonadmin.com";

  user = await DB.addUser(user);
  return { ...user, password: "toomanysecrets" };
}

async function loginTestUser(user) {
  const loginRes = await request(app).put("/api/auth").send({
    email: user.email,
    password: "toomanysecrets",
  });

  const userToken = loginRes.body.token;
  expectValidJwt(userToken);

  return userToken;
}

async function createTestFranchise() {
  const franchiseData = {
    name: randomName() + "Franchise",
    admins: [{ email: adminUser.email }],
  };
  const createRes = await request(app)
    .post("/api/franchise")
    .set("Authorization", `Bearer ${adminUserToken}`)
    .send(franchiseData);

  const franchiseId = createRes.body.id;
  expect(createRes.status).toBe(200);
  return franchiseId;
}

async function createTestMenuItem() {
  const menuItem = {
    title: randomName() + "Pizza",
    description: "Delicious test pizza",
    image: "test-pizza.png",
    price: 9.99,
  };

  const res = await request(app)
    .put("/api/order/menu")
    .set("Authorization", `Bearer ${adminUserToken}`)
    .send(menuItem);

  expect(res.status).toBe(200);

  return res.body.find((item) => item.title === menuItem.title);
}

async function createTestOrder() {
  const franchiseId = await createTestFranchise();
  const storeId = await createTestStore(franchiseId);
  const menuItem = await createTestMenuItem();

  const orderData = {
    franchiseId,
    storeId,
    items: [
      {
        menuId: menuItem.id,
        description: menuItem.title,
        price: menuItem.price,
      },
    ],
  };

  const orderRes = await request(app)
    .post("/api/order")
    .set("Authorization", `Bearer ${adminUserToken}`)
    .send(orderData);

  expect(orderRes.status).toBe(200);
  return orderRes.body.order;
}

async function createTestStore(franchiseId) {
  const storeData = {
    name: randomName() + "Store",
  };
  const storeRes = await request(app)
    .post(`/api/franchise/${franchiseId}/store`)
    .set("Authorization", `Bearer ${adminUserToken}`)
    .send(storeData);

  expect(storeRes.status).toBe(200);
  expect(storeRes.body.name).toBe(storeData.name);

  return storeRes.body.id;
}
