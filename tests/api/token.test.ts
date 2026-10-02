import request from "supertest";
import * as userRepo from "../../src/repositories/user.repository";
import * as projectRepo from "../../src/repositories/project.repository";
import * as organizationRepo from "../../src/repositories/organization.repository";
import { generateValidAdminToken } from "../tokenUtils";

describe("authentication routes", () => {
  it("should return 401 if no token is provided", async () => {
    const res = await request(global.__APP__).post("/auth/token").expect(401);

    //expect(res.body).toHaveProperty("message", "Missing Authorization header");
  });

  it("should return 401 for missing token", async () => {
    const res = await request(global.__APP__)
      .post("/auth/token")
      .set("Authorization", `Bearer `)
      .expect(401);

    //expect(res.body).toHaveProperty("message", "Missing token");
  });

  it("should return 401 for an invalid token", async () => {
    const fakeToken = "random-jwt-token";
    const res = await request(global.__APP__)
      .post("/auth/token")
      .set("Authorization", `Bearer ${fakeToken}`)
      .expect(401);

    //expect(res.body).toHaveProperty("message", "Invalid authorization header");
  });

  // it("should authorize a valid admin", async () => {
  //   const token = generateValidAdminToken();
  //   const res = await request(global.__APP__)
  //     .post("/auth/token")
  //     .set("Authorization", `Bearer ${token}`)
  //     .expect(200);

  //   console.log(res.body);

  //   //expect(res.body).toHaveProperty("message", "Invalid authorization header");
  // });

});
