const request = require("supertest");
const app = require("../service");
const { Role, DB } = require("../database/database");

const testUser = { name: "pizza diner", email: "reg@test.com", password: "a" };
let testUserAuthToken;

beforeAll(async () => {
  // tests register functionality
  testUser.email = randomName() + "@test.com";
  const registerRes = await request(app).post("/api/auth").send(testUser);
  testUserAuthToken = registerRes.body.token;
  testUser.id = registerRes.body.user.id; // capturing the ID
  expectValidJwt(testUserAuthToken);

  jest.mock("../metrics", () => ({
    sendMetricToGrafana: jest.fn(),
    trackAuthAttempt: jest.fn(),
    trackPizzaOrder: jest.fn(),
  }));
});

describe("Auth Router Tests", () => {
  test("login existing user", async () => {
    const loginRes = await request(app).put("/api/auth").send(testUser);
    expect(loginRes.status).toBe(200);
    expectValidJwt(loginRes.body.token);

    const expectedUser = { ...testUser, roles: [{ role: "diner" }] };
    delete expectedUser.password;
    expect(loginRes.body.user).toMatchObject(expectedUser);
  });

  test("Register a new user", async () => {
    const newUser = {
      name: "New User",
      email: randomName() + "@test.com",
      password: "newpassword",
    };
    const registerRes = await request(app).post("/api/auth").send(newUser);

    expect(registerRes.status).toBe(200);
    expectValidJwt(registerRes.body.token);

    const expectedUser = { ...newUser, roles: [{ role: "diner" }] };
    delete expectedUser.password;
    expect(registerRes.body.user).toMatchObject(expectedUser);
  });

  test("Fail to register with missing fields", async () => {
    const registerRes = await request(app)
      .post("/api/auth")
      .send({ name: "Missing Fields" });
    expect(registerRes.status).toBe(400);
    expect(registerRes.body.message).toBe(
      "name, email, and password are required"
    );
  });

  test("Update user as the same user", async () => {
    const newEmail = randomName() + "@test.com";
    const newPassword = "newPassword1";

    const updateRes = await request(app)
      .put(`/api/auth/${testUser.id}`)
      .set("Authorization", `Bearer ${testUserAuthToken}`)
      .send({ email: newEmail, password: newPassword });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.email).toBe(newEmail);
  });

  test("Update another user as an admin", async () => {
    const adminUser = await createAdminUser();
    const adminToken = (await request(app).put("/api/auth").send(adminUser))
      .body.token;

    const newEmail = randomName() + "@test.com";
    const newPassword = "newPassword";

    const updateRes = await request(app)
      .put(`/api/auth/${testUser.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email: newEmail, password: newPassword });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.email).toBe(newEmail);
  });

  test("Fail to update another user as a non-admin", async () => {
    const newEmail = randomName() + "@test.com";
    const newPassword = "newPassword2";
    const anotherUser = await DB.addUser({
      name: "Another User",
      email: "another@test.com",
      password: "password",
      roles: [{ role: "diner" }],
    });

    const updateRes = await request(app)
      .put(`/api/auth/${anotherUser.id}`)
      .set("Authorization", `Bearer ${testUserAuthToken}`)
      .send({ email: newEmail, password: newPassword });

    expect(updateRes.status).toBe(403);
    expect(updateRes.body.message).toBe("unauthorized");
  });

  test("Logout a user", async () => {
    const logoutRes = await request(app)
      .delete("/api/auth")
      .set("Authorization", `Bearer ${testUserAuthToken}`);

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.message).toBe("logout successful");
  });

  test("Fail to access endpoint after logout", async () => {
    const authCheckRes = await request(app)
      .put(`/api/auth/${testUser.id}`)
      .set("Authorization", `Bearer ${testUserAuthToken}`)
      .send({ email: "test@test.com" });

    expect(authCheckRes.status).toBe(401);
    expect(authCheckRes.body.message).toBe("unauthorized");
  });

  test("Return 404 when user does not exist", async () => {
    const res = await request(app)
      .put("/api/auth")
      .send({
        email: randomName() + "@test.com", // Non-existent user
        password: "randompassword",
      });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("unknown user");
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
