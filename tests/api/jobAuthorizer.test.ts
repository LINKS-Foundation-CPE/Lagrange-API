import request from "supertest";
import jwt from "jsonwebtoken";
import {
  validHeader,
  generateToken,
  randomSignature,
} from "../utils/tokenUtils.ts";
import * as mockData from "../utils/mockData";
import dataInitializer from "../utils/dataInitializer";

describe("jobAuthorizer routes", () => {
  const initializer = new dataInitializer();
  it("should return 401 if no token is provided", async () => {
    const res = await request(global.__APP__)
      .post("/jobAuthorizer")
      .expect(401);

    expect(res.body).toHaveProperty("message", "Missing Authorization header");
  });

  it("should return 401 for missing token", async () => {
    const res = await request(global.__APP__)
      .post("/jobAuthorizer")
      .set("Authorization", `Bearer `)
      .expect(401);

    expect(res.body).toHaveProperty("message", "Missing token");
  });

  it("should return 401 for an invalid token", async () => {
    const fakeToken = "random-jwt-token";
    const res = await request(global.__APP__)
      .post("/jobAuthorizer")
      .set("Authorization", `Bearer ${fakeToken}`)
      .expect(401);

    expect(res.body).toHaveProperty("message", "Invalid authorization header");
  });

  it("should return 403 for an unknown user", async () => {
    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: mockData.unknownUser,
      signature: randomSignature,
    });

    const token = generateToken(
      validHeader,
      mockData.unknownUser,
      randomSignature,
    );
    const res = await request(global.__APP__)
      .post("/jobAuthorizer")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);

    expect(res.body).toHaveProperty("message", "user not found in database");
    spy.mockRestore();
  });

  it("should return 403 for a user with no project", async () => {
    const links = await initializer.getLinks();
    const user = await initializer.initLinksUser();

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: user.email, sub: user.sub },
      signature: randomSignature,
    });

    const token = generateToken(
      validHeader,
      { email: user.email, sub: user.sub },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .post("/jobAuthorizer")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);

    expect(res.body).toHaveProperty(
      "message",
      "no project provided and no default project defined",
    );

    spy.mockRestore();
  });

  it("should return 403 for a user with non existent project", async () => {
    const links = await initializer.initLinksOrganization();
    const user = await initializer.initLinksUser();

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: user.email, sub: user.sub },
      signature: randomSignature,
    });

    const token = generateToken(
      validHeader,
      { email: user.email, sub: user.sub },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .post("/jobAuthorizer")
      .set("Authorization", `Bearer ${token}`)
      .send({ project: "unknown project" })
      .expect(403);

    expect(res.body).toHaveProperty(
      "message",
      "no project provided and no default project defined",
    );
    spy.mockRestore();
  });

  it("should return 200 for a user with default free queue project and no slots/reservations", async () => {
    const links = await initializer.initLinksOrganization();
    const user = await initializer.initLinksUser();
    const project = await initializer.initFreeQueueProject(links);
    await initializer.addUserToProject(user, project);
    await initializer.addDefaultProjectToUser(user, project);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: user.email, sub: user.sub },
      signature: randomSignature,
    });

    const token = generateToken(
      validHeader,
      { email: user.email, sub: user.sub },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .post("/jobAuthorizer")
      .set("Authorization", `Bearer ${token}`)
      //.send({ project: "test" })
      .expect(200);

    spy.mockRestore();
  });

  it("should return 200 for a valid user with defined free queue project and no slots/reservations", async () => {
    const links = await initializer.initLinksOrganization();
    const user = await initializer.initLinksUser();
    const project = await initializer.initFreeQueueProject(links);
    await initializer.addUserToProject(user, project);
    //await initializer.addDefaultProjectToUser(user, project);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: user.email, sub: user.sub },
      signature: randomSignature,
    });

    const token = generateToken(
      validHeader,
      { email: user.email, sub: user.sub },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .post("/jobAuthorizer")
      .set("Authorization", `Bearer ${token}`)
      .send({ project_name: project.name })
      .expect(200);

    spy.mockRestore();
  });

  it("should return 200 for a valid user with defined no free queue project with budget and no slots/reservations", async () => {
    const links = await initializer.initLinksOrganization();
    const user = await initializer.initLinksUser();
    const project = await initializer.initNoFreeQueueProject(links, 1);
    await initializer.addUserToProject(user, project);
    //await initializer.addDefaultProjectToUser(user, project);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: user.email, sub: user.sub },
      signature: randomSignature,
    });

    const token = generateToken(
      validHeader,
      { email: user.email, sub: user.sub },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .post("/jobAuthorizer")
      .set("Authorization", `Bearer ${token}`)
      .send({ project_name: project.name })
      .expect(200);

    spy.mockRestore();
  });

  it("should return 403 for a valid user with defined no free queue project without budget and no slots/reservations", async () => {
    const links = await initializer.initLinksOrganization();
    const user = await initializer.initLinksUser();
    const project = await initializer.initNoFreeQueueProject(links, 0);

    await initializer.addUserToProject(user, project);
    //await initializer.addDefaultProjectToUser(user, project);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: user.email, sub: user.sub },
      signature: randomSignature,
    });

    const token = generateToken(
      validHeader,
      { email: user.email, sub: user.sub },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .post("/jobAuthorizer")
      .set("Authorization", `Bearer ${token}`)
      .send({ project_name: project.name })
      .expect(403);

    expect(res.body).toHaveProperty(
      "message",
      `No budget available for project ${project.name}`,
    );

    spy.mockRestore();
  });

  it("should return 200 for a valid user with default no free queue project with budget and no slots/reservations", async () => {
    const links = await initializer.initLinksOrganization();
    const user = await initializer.initLinksUser();
    const project = await initializer.initNoFreeQueueProject(links, 1);
    await initializer.addUserToProject(user, project);
    await initializer.addDefaultProjectToUser(user, project);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: user.email, sub: user.sub },
      signature: randomSignature,
    });

    const token = generateToken(
      validHeader,
      { email: user.email, sub: user.sub },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .post("/jobAuthorizer")
      .set("Authorization", `Bearer ${token}`)
      //.send({ project_name: project.name })
      .expect(200);

    spy.mockRestore();
  });

  it("should return 403 for a valid user with default no free queue project without budget and no slots/reservations", async () => {
    const links = await initializer.initLinksOrganization();
    const user = await initializer.initLinksUser();
    const project = await initializer.initNoFreeQueueProject(links, 0);

    await initializer.addUserToProject(user, project);
    await initializer.addDefaultProjectToUser(user, project);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: user.email, sub: user.sub },
      signature: randomSignature,
    });

    const token = generateToken(
      validHeader,
      { email: user.email, sub: user.sub },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .post("/jobAuthorizer")
      .set("Authorization", `Bearer ${token}`)
      //.send({ project_name: project.name })
      .expect(403);

    expect(res.body).toHaveProperty(
      "message",
      `No budget available for project ${project.name}`,
    );

    spy.mockRestore();
  });

  it("should return 403 for an expired project", async () => {
    const links = await initializer.initLinksOrganization();
    const user = await initializer.initLinksUser();
    const project = await initializer.initExpiredProject(links, 1000);

    await initializer.addUserToProject(user, project);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: user.email, sub: user.sub },
      signature: randomSignature,
    });

    const token = generateToken(
      validHeader,
      { email: user.email, sub: user.sub },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .post("/jobAuthorizer")
      .set("Authorization", `Bearer ${token}`)
      .send({ project_name: project.name })
      .expect(403);

    expect(res.body).toHaveProperty(
      "message",
      `Project '${project.name}' already expired`,
    );

    spy.mockRestore();
  });

  it("should return 403 for a not yet started project", async () => {
    const links = await initializer.initLinksOrganization();
    const user = await initializer.initLinksUser();
    const project = await initializer.initNotStartedProject(links, 1000);

    await initializer.addUserToProject(user, project);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: user.email, sub: user.sub },
      signature: randomSignature,
    });

    const token = generateToken(
      validHeader,
      { email: user.email, sub: user.sub },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .post("/jobAuthorizer")
      .set("Authorization", `Bearer ${token}`)
      .send({ project_name: project.name })
      .expect(403);

    expect(res.body).toHaveProperty(
      "message",
      `Project '${project.name}' not yet started`,
    );

    spy.mockRestore();
  });

  it("should return 200 for a valid user with project defined, with free queue and assigned slot to same org", async () => {
    const links = await initializer.initLinksOrganization();
    const user = await initializer.initLinksUser();
    const project = await initializer.initFreeQueueProject(links, 0);
    const slot = await initializer.assignCurrentSlot(links);

    await initializer.addUserToProject(user, project);
    //await initializer.addDefaultProjectToUser(user, project);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: user.email, sub: user.sub },
      signature: randomSignature,
    });

    const token = generateToken(
      validHeader,
      { email: user.email, sub: user.sub },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .post("/jobAuthorizer")
      .set("Authorization", `Bearer ${token}`)
      .send({ project_name: project.name })
      .expect(200);

    spy.mockRestore();
  });

  it("should return 200 for a valid user with default project, with free queue and assigned slot to same org", async () => {
    const links = await initializer.initLinksOrganization();
    const user = await initializer.initLinksUser();
    const project = await initializer.initFreeQueueProject(links, 0);
    const slot = await initializer.assignCurrentSlot(links);

    await initializer.addUserToProject(user, project);
    await initializer.addDefaultProjectToUser(user, project);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: user.email, sub: user.sub },
      signature: randomSignature,
    });

    const token = generateToken(
      validHeader,
      { email: user.email, sub: user.sub },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .post("/jobAuthorizer")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    spy.mockRestore();
  });

  // it("should return 403 for a slot assigned to another organization", async () => {
  //   const links = await initializer.initLinksOrganization();
  //   const polito = await initializer.initPolitoOrganization();
  //   const user = await initializer.initLinksUser();
  //   const project = await initializer.initFreeQueueProject(links, 0);
  //   const slot = await initializer.assignCurrentSlot(polito);

  //   await initializer.addUserToProject(user, project);
  //   await initializer.addDefaultProjectToUser(user, project);

  //   const spy = jest.spyOn(jwt, "decode").mockReturnValue({
  //     header: validHeader,
  //     payload: { email: user.email, sub: user.sub },
  //     signature: randomSignature,
  //   });

  //   const token = generateToken(
  //     validHeader,
  //     { email: user.email, sub: user.sub },
  //     randomSignature,
  //   );

  //   const res = await request(global.__APP__)
  //     .post("/jobAuthorizer")
  //     .set("Authorization", `Bearer ${token}`)
  //     .expect(403);

  //   expect(res.body).toHaveProperty(
  //     "message",
  //     `Slot reserved to another organization`,
  //   );

  //   spy.mockRestore();
  // });

  it("should return 200 for a slot assigned to another organization but without reservations", async () => {
    const links = await initializer.initLinksOrganization();
    const polito = await initializer.initPolitoOrganization();
    const user = await initializer.initLinksUser();
    const project = await initializer.initFreeQueueProject(links, 0);
    const slot = await initializer.assignCurrentSlot(polito);

    await initializer.addUserToProject(user, project);
    await initializer.addDefaultProjectToUser(user, project);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: user.email, sub: user.sub },
      signature: randomSignature,
    });

    const token = generateToken(
      validHeader,
      { email: user.email, sub: user.sub },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .post("/jobAuthorizer")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    // expect(res.body).toHaveProperty(
    //   "message",
    //   `Slot reserved to another organization`,
    // );

    spy.mockRestore();
  });

  it("should return 200 for a user with same project as current reservation", async () => {
    const links = await initializer.initLinksOrganization();
    const user = await initializer.initLinksUser();
    const project = await initializer.initFreeQueueProject(links, 0);
    const slot = await initializer.assignCurrentSlot(links);
    const reservation = await initializer.addReservation(slot, project, user);

    await initializer.addUserToProject(user, project);
    await initializer.addDefaultProjectToUser(user, project);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: user.email, sub: user.sub },
      signature: randomSignature,
    });

    const token = generateToken(
      validHeader,
      { email: user.email, sub: user.sub },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .post("/jobAuthorizer")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    spy.mockRestore();
  });

  it("should return 200 for a user with same project as current reservation even with different org", async () => {
    const links = await initializer.initLinksOrganization();
    const polito = await initializer.initPolitoOrganization();
    const politoUser = await initializer.initPolitoUser();
    const user = await initializer.initLinksUser();
    const project = await initializer.initFreeQueueProject(polito, 0);
    const slot = await initializer.assignCurrentSlot(polito);
    const reservation = await initializer.addReservation(
      slot,
      project,
      politoUser,
    );

    await initializer.addUserToProject(user, project);
    await initializer.addDefaultProjectToUser(user, project);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: user.email, sub: user.sub },
      signature: randomSignature,
    });

    const token = generateToken(
      validHeader,
      { email: user.email, sub: user.sub },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .post("/jobAuthorizer")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    spy.mockRestore();
  });

  it("should return 403 for a different project than current reservation", async () => {
    const links = await initializer.initLinksOrganization();
    const user = await initializer.initLinksUser();
    const userProject = await initializer.initFreeQueueProject(links, 0);
    const reservationProject = await initializer.initFreeQueueProject(links, 0);
    const slot = await initializer.assignCurrentSlot(links);
    const reservation = await initializer.addReservation(
      slot,
      reservationProject,
      user,
    );

    await initializer.addUserToProject(user, userProject);
    await initializer.addDefaultProjectToUser(user, userProject);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: user.email, sub: user.sub },
      signature: randomSignature,
    });

    const token = generateToken(
      validHeader,
      { email: user.email, sub: user.sub },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .post("/jobAuthorizer")
      .set("Authorization", `Bearer ${token}`)
      .send({ project_name: userProject.name })
      .expect(403);

    expect(res.body).toHaveProperty(
      "message",
      `Slot reserved to another project`,
    );

    spy.mockRestore();
  });

  // The QC Gateway forwarded the machine request's own content-type onto its
  // /jobAuthorizer call, so a sweep arrived labelled as something other than
  // JSON. The body then parsed as empty, the pulse check saw no job_type and
  // the project check saw no project_name, and the job was authorized against
  // the user's default project.
  it("refuses a sweep whose body arrives with a foreign content-type", async () => {
    const polito = await initializer.initPolitoOrganization();
    const user = await initializer.initPolitoUser();
    const project = await initializer.initFreeQueueProject(polito, 0);
    await initializer.addUserToProject(user, project);
    await initializer.addDefaultProjectToUser(user, project);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: user.email, sub: user.sub },
      signature: randomSignature,
    });
    const token = generateToken(
      validHeader,
      { email: user.email, sub: user.sub },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .post("/jobAuthorizer")
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "application/octet-stream")
      .send(JSON.stringify({ job_type: "sweep", project_name: project.name }))
      .expect(403);

    expect(res.body).toHaveProperty(
      "message",
      `User '${user.email}' does not have pulse access`,
    );
    spy.mockRestore();
  });

  it("refuses a sweep from a user without pulse access", async () => {
    const polito = await initializer.initPolitoOrganization();
    const user = await initializer.initPolitoUser(); // pulla_user defaults false
    const project = await initializer.initFreeQueueProject(polito, 0);
    await initializer.addUserToProject(user, project);
    await initializer.addDefaultProjectToUser(user, project);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: user.email, sub: user.sub },
      signature: randomSignature,
    });
    const token = generateToken(
      validHeader,
      { email: user.email, sub: user.sub },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .post("/jobAuthorizer")
      .set("Authorization", `Bearer ${token}`)
      .send({ job_type: "sweep" })
      .expect(403);

    expect(res.body).toHaveProperty(
      "message",
      `User '${user.email}' does not have pulse access`,
    );
    spy.mockRestore();
  });

  it("allows a sweep from a user who has pulse access", async () => {
    const polito = await initializer.initPolitoOrganization();
    const user = await initializer.initPolitoUser();
    user.pulla_user = true;
    await user.save();
    const project = await initializer.initFreeQueueProject(polito, 0);
    await initializer.addUserToProject(user, project);
    await initializer.addDefaultProjectToUser(user, project);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: user.email, sub: user.sub },
      signature: randomSignature,
    });
    const token = generateToken(
      validHeader,
      { email: user.email, sub: user.sub },
      randomSignature,
    );

    await request(global.__APP__)
      .post("/jobAuthorizer")
      .set("Authorization", `Bearer ${token}`)
      .send({ job_type: "sweep" })
      .expect(200);

    spy.mockRestore();
  });

  it("does not gate a circuit, or a request from a gateway that sends no job_type", async () => {
    // The compatibility case: an older gateway sends {username, project_name}
    // and nothing else, and must keep working exactly as before.
    const polito = await initializer.initPolitoOrganization();
    const user = await initializer.initPolitoUser(); // no pulse access
    const project = await initializer.initFreeQueueProject(polito, 0);
    await initializer.addUserToProject(user, project);
    await initializer.addDefaultProjectToUser(user, project);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: user.email, sub: user.sub },
      signature: randomSignature,
    });
    const token = generateToken(
      validHeader,
      { email: user.email, sub: user.sub },
      randomSignature,
    );

    for (const body of [{ job_type: "circuit" }, {}]) {
      await request(global.__APP__)
        .post("/jobAuthorizer")
        .set("Authorization", `Bearer ${token}`)
        .send(body)
        .expect(200);
    }

    spy.mockRestore();
  });

  it("should return 200 inside a reservation for a member with no default project at all", async () => {
    // The case above sets a default project pointing elsewhere, which proves
    // the reservation wins over it. This is the other half: a user who has
    // never set one. Membership of the reserving project is the whole claim,
    // and the reservation branch returns before the default project is
    // consulted — a refactor that resolved the default project first would
    // turn this into "no project provided and no default project defined".
    const polito = await initializer.initPolitoOrganization();
    await initializer.initLinksOrganization();
    const politoUser = await initializer.initPolitoUser();
    const user = await initializer.initLinksUser(); // default_project_id: null
    const project = await initializer.initFreeQueueProject(polito, 0);
    const slot = await initializer.assignCurrentSlot(polito);
    await initializer.addReservation(slot, project, politoUser);

    await initializer.addUserToProject(user, project);
    expect(user.default_project_id).toBeNull();

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: user.email, sub: user.sub },
      signature: randomSignature,
    });
    const token = generateToken(
      validHeader,
      { email: user.email, sub: user.sub },
      randomSignature,
    );

    await request(global.__APP__)
      .post("/jobAuthorizer")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    spy.mockRestore();
  });

  it("should return 403 inside a reservation for a non-member with no default project", async () => {
    // The same shape, minus the membership: nothing then authorises the job,
    // and the default-project branch is reached and refuses.
    const polito = await initializer.initPolitoOrganization();
    await initializer.initLinksOrganization();
    const politoUser = await initializer.initPolitoUser();
    const user = await initializer.initLinksUser();
    const project = await initializer.initFreeQueueProject(polito, 0);
    const slot = await initializer.assignCurrentSlot(polito);
    await initializer.addReservation(slot, project, politoUser);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: user.email, sub: user.sub },
      signature: randomSignature,
    });
    const token = generateToken(
      validHeader,
      { email: user.email, sub: user.sub },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .post("/jobAuthorizer")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);

    expect(res.body).toHaveProperty(
      "message",
      "no project provided and no default project defined",
    );
    spy.mockRestore();
  });

  it("should return 200 if a project is not provided but user is part of current reservation's project", async () => {
    const links = await initializer.initLinksOrganization();
    const polito = await initializer.initPolitoOrganization();
    const politoUser = await initializer.initPolitoUser();
    const user = await initializer.initLinksUser();
    const project = await initializer.initFreeQueueProject(polito, 0);
    const anotherProject = await initializer.initFreeQueueProject(links, 0);
    const slot = await initializer.assignCurrentSlot(polito);
    const reservation = await initializer.addReservation(
      slot,
      project,
      politoUser,
    );

    await initializer.addUserToProject(user, project);
    await initializer.addDefaultProjectToUser(user, anotherProject);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: user.email, sub: user.sub },
      signature: randomSignature,
    });

    const token = generateToken(
      validHeader,
      { email: user.email, sub: user.sub },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .post("/jobAuthorizer")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    spy.mockRestore();
  });
});
