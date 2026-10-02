import request from "supertest";
import * as mockData from "../utils/mockData.ts";
import dataInitializer from "../utils/dataInitializer.ts";
import * as repo from "../../src/repositories/job.repository.ts";
import * as budgetEventRepo from "../../src/repositories/budgetEvent.repository.ts";
import { DateTime } from "luxon";

describe("jobReport routes", () => {
  const initializer = new dataInitializer();
  it("CREATE: should return 400 if user is not found", async () => {
    const res = await request(global.__APP__)
      .post("/jobReport")
      .send({
        project_name: "Links Free Queue",
        username: "user@unknown.com",
        jobid: "uuid",
        submitted_datetime: new Date(),
      })
      .expect(400);

    expect(res.body).toHaveProperty(
      "message",
      `user user@unknown.com not found`,
    );
  });

  it("CREATE: should return 400 if project is not found", async () => {
    const links = await initializer.initLinksOrganization();
    const user = await initializer.initLinksUser();

    const res = await request(global.__APP__)
      .post("/jobReport")
      .send({
        project_name: "random-project",
        username: user.email,
        jobid: "uuid",
        submitted_datetime: new Date(),
      })
      .expect(400);

    expect(res.body).toHaveProperty("message", `project not found`);
  });

  it("CREATE: should return 200 if username and project_name are OK", async () => {
    const polito = await initializer.initPolitoOrganization();
    const user = await initializer.initPolitoUser();
    const project = await initializer.initNoFreeQueueProject(polito);
    await initializer.addUserToProject(user, project);

    const res = await request(global.__APP__)
      .post("/jobReport")
      .send({
        project_name: project.name,
        username: user.email,
        jobid: "uuid",
        submitted_datetime: new Date(),
      })
      .expect(200);
  });

  it("CREATE: should return 200 if username and user's default project are OK", async () => {
    const polito = await initializer.initPolitoOrganization();
    const user = await initializer.initPolitoUser();
    const project = await initializer.initNoFreeQueueProject(polito);
    await initializer.addUserToProject(user, project);
    await initializer.addDefaultProjectToUser(user, project);

    const res = await request(global.__APP__)
      .post("/jobReport")
      .send({
        //project_name: project.name,
        username: user.email,
        jobid: "uuid",
        submitted_datetime: new Date(),
      })
      .expect(200);
  });

  it("CREATE: should instantiate job_type as 'circuit' if not specified", async () => {
    const polito = await initializer.initPolitoOrganization();
    const user = await initializer.initPolitoUser();
    const project = await initializer.initNoFreeQueueProject(polito);
    await initializer.addUserToProject(user, project);

    const res = await request(global.__APP__)
      .post("/jobReport")
      .send({
        project_name: project.name,
        username: user.email,
        jobid: "uuid",
        submitted_datetime: new Date(),
      })
      .expect(200);

    const jobs = await repo.getList({});
    expect(jobs.rows[0].job_type).toEqual("circuit");
  });

  it("CREATE: should instantiate job_type as specified", async () => {
    const polito = await initializer.initPolitoOrganization();
    const user = await initializer.initPolitoUser();
    const project = await initializer.initNoFreeQueueProject(polito);
    await initializer.addUserToProject(user, project);

    const res = await request(global.__APP__)
      .post("/jobReport")
      .send({
        project_name: project.name,
        username: user.email,
        jobid: "uuid",
        submitted_datetime: new Date(),
        job_type: "test",
      })
      .expect(200);

    const jobs = await repo.getList({});
    expect(jobs.rows[0].job_type).toEqual("test");
  });

  // TODO: user with no default project and no project specified but there is currently a reservation

  it("UPDATE: should return 404 if jobid is not found", async () => {
    const res = await request(global.__APP__)
      .put("/jobReport/random-uuid")
      .send({})
      .expect(404);

    expect(res.body).toHaveProperty("message", `jobid random-uuid not found`);
  });

  it("UPDATE: should return 200 if jobid is found", async () => {
    const polito = await initializer.initPolitoOrganization();
    const user = await initializer.initPolitoUser();
    const project = await initializer.initNoFreeQueueProject(polito);

    const job = await repo.create({
      jobid: "valid-job-id",
      organization_id: polito.id,
      project_id: project.id,
      user_id: user.id,
      status: undefined,
      execution_start: undefined,
      execution_end: undefined,
      submitted_datetime: new Date(),
      submitted_circuit: undefined,
      results: undefined,
      usedReservation: false,
      job_type: undefined,
    });

    const res = await request(global.__APP__)
      .put(`/jobReport/${job.jobid}`)
      .send({
        status: "ready",
        execution_start: "2025-09-09T12:58:36.947127Z",
        execution_end: "2025-09-09T12:58:37.947127Z",
        submitted_datetime: "2025-09-09T12:58:35.947127Z",
        submitted_circuit: "http://test.com",
        results: "http://test.com",
      })
      .expect(200);

    const updatedJob = await repo.getByJobid(job.jobid);
    //console.log(updatedJob);

    // TODO: validate job

    const budgetEvents = await budgetEventRepo.getList({});
    //console.log(budgetEvents.rows[0]);
    // TODO: validate budgetEvent
  });

  it("UPDATE: should not bill a freeQueue project", async () => {
    const polito = await initializer.initPolitoOrganization();
    const user = await initializer.initPolitoUser();
    const project = await initializer.initFreeQueueProject(polito);

    const job = await repo.create({
      jobid: "valid-job-id",
      organization_id: polito.id,
      project_id: project.id,
      user_id: user.id,
      status: undefined,
      execution_start: undefined,
      execution_end: undefined,
      submitted_datetime: new Date(),
      submitted_circuit: undefined,
      results: undefined,
      usedReservation: false,
      job_type: undefined,
    });

    const budgetEventsBefore = await budgetEventRepo.getList({});

    const res = await request(global.__APP__)
      .put(`/jobReport/${job.jobid}`)
      .send({
        status: "ready",
        execution_start: "2025-09-09T12:58:36.947127Z",
        execution_end: "2025-09-09T12:58:37.947127Z",
        submitted_datetime: "2025-09-09T12:58:35.947127Z",
        submitted_circuit: "http://test.com",
        results: "http://test.com",
      })
      .expect(200);

    const updatedJob = await repo.getByJobid(job.jobid);
    //console.log(updatedJob);

    // TODO: validate job

    const budgetEventsAfter = await budgetEventRepo.getList({});

    // TODO: validate budgetEvent

    expect(budgetEventsBefore.count).toEqual(budgetEventsAfter.count);
  });

  it("UPDATE: should bill a not freeQueue project outside a reservation", async () => {
    const polito = await initializer.initPolitoOrganization();
    const user = await initializer.initPolitoUser();
    const project = await initializer.initNoFreeQueueProject(polito);

    const job = await repo.create({
      jobid: "valid-job-id",
      organization_id: polito.id,
      project_id: project.id,
      user_id: user.id,
      status: undefined,
      execution_start: undefined,
      execution_end: undefined,
      submitted_datetime: new Date(),
      submitted_circuit: undefined,
      results: undefined,
      usedReservation: false,
      job_type: undefined,
    });

    const budgetEventsBefore = await budgetEventRepo.getList({});

    const res = await request(global.__APP__)
      .put(`/jobReport/${job.jobid}`)
      .send({
        status: "ready",
        execution_start: "2025-09-09T12:58:36.947127Z",
        execution_end: "2025-09-09T12:58:37.947127Z",
        submitted_datetime: "2025-09-09T12:58:35.947127Z",
        submitted_circuit: "http://test.com",
        results: "http://test.com",
      })
      .expect(200);

    const updatedJob = await repo.getByJobid(job.jobid);
    //console.log(updatedJob);

    // TODO: validate job

    const budgetEventsAfter = await budgetEventRepo.getList({});

    expect(budgetEventsBefore.count).toEqual(budgetEventsAfter.count - 1);
    // TODO: validate budgetEvent
  });

  it("UPDATE: attributes the charge to the user who submitted the job", async () => {
    // The ledger says which job a charge came from; without user_id the person
    // behind it is a second lookup away, and the Budget Transactions tab cannot
    // show it at all.
    const polito = await initializer.initPolitoOrganization();
    const user = await initializer.initPolitoUser();
    const project = await initializer.initNoFreeQueueProject(polito);

    const job = await repo.create({
      jobid: "attributed-job-id",
      organization_id: polito.id,
      project_id: project.id,
      user_id: user.id,
      status: undefined,
      execution_start: undefined,
      execution_end: undefined,
      submitted_datetime: new Date(),
      submitted_circuit: undefined,
      results: undefined,
      usedReservation: false,
      job_type: undefined,
    });

    await request(global.__APP__)
      .put(`/jobReport/${job.jobid}`)
      .send({
        status: "ready",
        execution_start: "2025-09-09T12:58:36.947127Z",
        execution_end: "2025-09-09T12:58:37.947127Z",
        submitted_datetime: "2025-09-09T12:58:35.947127Z",
        submitted_circuit: "http://test.com",
        results: "http://test.com",
      })
      .expect(200);

    const events = await budgetEventRepo.getList({ project_id: project.id });
    const charge = events.rows.find((row) =>
      row.description?.includes(job.jobid),
    );
    expect(charge).toBeDefined();
    expect(charge?.user_id).toEqual(user.id);
  });

  it("UPDATE: should not bill a not freeQueue project inside a reservation", async () => {
    const polito = await initializer.initPolitoOrganization();
    const user = await initializer.initPolitoUser();
    const project = await initializer.initNoFreeQueueProject(polito);

    const now = DateTime.utc();

    const budgetEventsBefore = await budgetEventRepo.getList({});

    //console.log("budgetEventsBefore: ");
    //console.log(budgetEventsBefore);

    const slot = await initializer.assignCurrentSlot(polito);

    const reservation = await initializer.addReservation(slot, project, user);

    //console.log(slot);
    //console.log(reservation);

    const res1 = await request(global.__APP__).post(`/jobReport`).send({
      project_name: project.name,
      username: user.email,
      jobid: "valid-job-id",
      submitted_datetime: new Date(),
    });
    //.expect(200);

    // console.log("res1.body: ");
    // console.log(res1.body);

    // const job = await repo.create({
    //   jobid: "valid-job-id",
    //   organization_id: polito.id,
    //   project_id: project.id,
    //   user_id: user.id,
    //   status: undefined,
    //   execution_start: undefined,
    //   execution_end: undefined,
    //   submitted_datetime: new Date(),
    //   submitted_circuit: undefined,
    //   results: undefined,
    //   usedReservation: false,
    // });

    // console.log(
    //   "now.minus({ minutes: 1 }).toISO(): ",
    //   now.minus({ minutes: 1 }).toISO({ includeOffset: false }),
    // );

    // console.log("now.toISO(): ", now.toISO({ includeOffset: false }));

    const ts = DateTime.utc().toISO({ includeOffset: true });
    const tsminus = DateTime.utc()
      .minus({ minutes: 1 })
      .toISO({ includeOffset: true });
    //console.log(tsminus);

    const res = await request(global.__APP__)
      .put(`/jobReport/${"valid-job-id"}`)
      .send({
        status: "ready",
        execution_start: tsminus,
        execution_end: ts,
        submitted_datetime: "2025-09-09T12:58:35.947127Z",
        submitted_circuit: "http://test.com",
        results: "http://test.com",
      })
      .expect(200);

    const updatedJob = await repo.getByJobid("valid-job-id");

    //console.log("updatedJob:");
    //console.log(updatedJob);

    // TODO: validate job

    const budgetEventsAfter = await budgetEventRepo.getList({});

    //console.log("budgetEventsAfter: ");
    //console.log(budgetEventsAfter.rows[0]);

    //console.log("budgetEventsBefore.count: ", budgetEventsBefore.count);
    //console.log("budgetEventsAfter.count: ", budgetEventsAfter.count);

    expect(budgetEventsBefore.count).toEqual(budgetEventsAfter.count);
  });

  it("UPDATE: should not create transaction for failed project", async () => {
    const polito = await initializer.initPolitoOrganization();
    const user = await initializer.initPolitoUser();
    const project = await initializer.initNoFreeQueueProject(polito);

    const res1 = await request(global.__APP__).post(`/jobReport`).send({
      project_name: project.name,
      username: user.email,
      jobid: "valid-job-id",
      submitted_datetime: new Date(),
    });
    //.expect(200);

    // console.log("res1.body: ");
    // console.log(res1.body);

    // const job = await repo.create({
    //   jobid: "valid-job-id",
    //   organization_id: polito.id,
    //   project_id: project.id,
    //   user_id: user.id,
    //   status: undefined,
    //   execution_start: undefined,
    //   execution_end: undefined,
    //   submitted_datetime: new Date(),
    //   submitted_circuit: undefined,
    //   results: undefined,
    //   usedReservation: false,
    // });

    // console.log(
    //   "now.minus({ minutes: 1 }).toISO(): ",
    //   now.minus({ minutes: 1 }).toISO({ includeOffset: false }),
    // );

    // console.log("now.toISO(): ", now.toISO({ includeOffset: false }));

    // const ts = DateTime.utc().toISO({ includeOffset: true });
    // const tsminus = DateTime.utc()
    //   .minus({ minutes: 1 })
    //   .toISO({ includeOffset: true });
    // //console.log(tsminus);

    const res = await request(global.__APP__)
      .put(`/jobReport/${"valid-job-id"}`)
      .send({
        status: "failed",
        execution_start: "",
        execution_end: "",
        submitted_datetime: "2025-09-09T12:58:35.947127Z",
      })
      .expect(200);

    console.log(res.body);

    const updatedJob = await repo.getByJobid("valid-job-id");

    console.log("updatedJob:");
    console.log(updatedJob);

    // TODO: validate job

    const budgetEventsAfter = await budgetEventRepo.getList({});

    //console.log("budgetEventsAfter: ");
    //console.log(budgetEventsAfter.rows[0]);

    //console.log("budgetEventsBefore.count: ", budgetEventsBefore.count);
    //console.log("budgetEventsAfter.count: ", budgetEventsAfter.count);

    expect(0).toEqual(budgetEventsAfter.count);
  });

  // it("should return 401 for missing token", async () => {
  //   const res = await request(global.__APP__)
  //     .post("/jobAuthorizer")
  //     .set("Authorization", `Bearer `)
  //     .expect(401);

  //   expect(res.body).toHaveProperty("message", "Missing token");
  // });

  // it("should return 401 for an invalid token", async () => {
  //   const fakeToken = "random-jwt-token";
  //   const res = await request(global.__APP__)
  //     .post("/jobAuthorizer")
  //     .set("Authorization", `Bearer ${fakeToken}`)
  //     .expect(401);

  //   expect(res.body).toHaveProperty("message", "Invalid authorization header");
  // });

  // it("should return 403 for an unknown user", async () => {
  //   const spy = jest.spyOn(jwt, "decode").mockReturnValue({
  //     header: validHeader,
  //     payload: mockData.unknownUser,
  //     signature: randomSignature,
  //   });

  //   const token = generateToken(
  //     validHeader,
  //     mockData.unknownUser,
  //     randomSignature,
  //   );
  //   const res = await request(global.__APP__)
  //     .post("/jobAuthorizer")
  //     .set("Authorization", `Bearer ${token}`)
  //     .expect(403);

  //   expect(res.body).toHaveProperty("message", "user not found in database");
  //   spy.mockRestore();
  // });

  // it("should return 403 for a user with no project", async () => {
  //   const links = await initializer.getLinks();
  //   const user = await initializer.initLinksUser();

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
  //     "no project provided and no default project defined",
  //   );

  //   spy.mockRestore();
  // });

  // it("should return 403 for a user with non existent project", async () => {
  //   const links = await initializer.initLinksOrganization();
  //   const user = await initializer.initLinksUser();

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
  //     .send({ project: "unknown project" })
  //     .expect(403);

  //   expect(res.body).toHaveProperty(
  //     "message",
  //     "no project provided and no default project defined",
  //   );
  //   spy.mockRestore();
  // });

  // it("should return 200 for a user with default free queue project and no slots/reservations", async () => {
  //   const links = await initializer.initLinksOrganization();
  //   const user = await initializer.initLinksUser();
  //   const project = await initializer.initFreeQueueProject(links);
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
  //     //.send({ project: "test" })
  //     .expect(200);

  //   spy.mockRestore();
  // });

  // it("should return 200 for a valid user with defined free queue project and no slots/reservations", async () => {
  //   const links = await initializer.initLinksOrganization();
  //   const user = await initializer.initLinksUser();
  //   const project = await initializer.initFreeQueueProject(links);
  //   await initializer.addUserToProject(user, project);
  //   //await initializer.addDefaultProjectToUser(user, project);

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
  //     .send({ project_name: project.name })
  //     .expect(200);

  //   spy.mockRestore();
  // });

  // it("should return 200 for a valid user with defined no free queue project with budget and no slots/reservations", async () => {
  //   const links = await initializer.initLinksOrganization();
  //   const user = await initializer.initLinksUser();
  //   const project = await initializer.initNoFreeQueueProject(links, 1);
  //   await initializer.addUserToProject(user, project);
  //   //await initializer.addDefaultProjectToUser(user, project);

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
  //     .send({ project_name: project.name })
  //     .expect(200);

  //   spy.mockRestore();
  // });

  // it("should return 403 for a valid user with defined no free queue project without budget and no slots/reservations", async () => {
  //   const links = await initializer.initLinksOrganization();
  //   const user = await initializer.initLinksUser();
  //   const project = await initializer.initNoFreeQueueProject(links, 0);

  //   await initializer.addUserToProject(user, project);
  //   //await initializer.addDefaultProjectToUser(user, project);

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
  //     .send({ project_name: project.name })
  //     .expect(403);

  //   expect(res.body).toHaveProperty(
  //     "message",
  //     `No budget available for project ${project.name}`,
  //   );

  //   spy.mockRestore();
  // });

  // it("should return 200 for a valid user with default no free queue project with budget and no slots/reservations", async () => {
  //   const links = await initializer.initLinksOrganization();
  //   const user = await initializer.initLinksUser();
  //   const project = await initializer.initNoFreeQueueProject(links, 1);
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
  //     //.send({ project_name: project.name })
  //     .expect(200);

  //   spy.mockRestore();
  // });

  // it("should return 403 for a valid user with default no free queue project without budget and no slots/reservations", async () => {
  //   const links = await initializer.initLinksOrganization();
  //   const user = await initializer.initLinksUser();
  //   const project = await initializer.initNoFreeQueueProject(links, 0);

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
  //     //.send({ project_name: project.name })
  //     .expect(403);

  //   expect(res.body).toHaveProperty(
  //     "message",
  //     `No budget available for project ${project.name}`,
  //   );

  //   spy.mockRestore();
  // });

  // it("should return 403 for an expired project", async () => {
  //   const links = await initializer.initLinksOrganization();
  //   const user = await initializer.initLinksUser();
  //   const project = await initializer.initExpiredProject(links, 1000);

  //   await initializer.addUserToProject(user, project);

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
  //     .send({ project_name: project.name })
  //     .expect(403);

  //   expect(res.body).toHaveProperty(
  //     "message",
  //     `Project '${project.name}' already expired`,
  //   );

  //   spy.mockRestore();
  // });

  // it("should return 403 for a not yet started project", async () => {
  //   const links = await initializer.initLinksOrganization();
  //   const user = await initializer.initLinksUser();
  //   const project = await initializer.initNotStartedProject(links, 1000);

  //   await initializer.addUserToProject(user, project);

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
  //     .send({ project_name: project.name })
  //     .expect(403);

  //   expect(res.body).toHaveProperty(
  //     "message",
  //     `Project '${project.name}' not yet started`,
  //   );

  //   spy.mockRestore();
  // });

  // it("should return 200 for a valid user with project defined, with free queue and assigned slot to same org", async () => {
  //   const links = await initializer.initLinksOrganization();
  //   const user = await initializer.initLinksUser();
  //   const project = await initializer.initFreeQueueProject(links, 0);
  //   const slot = await initializer.assignCurrentSlot(links);

  //   await initializer.addUserToProject(user, project);
  //   //await initializer.addDefaultProjectToUser(user, project);

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
  //     .send({ project_name: project.name })
  //     .expect(200);

  //   spy.mockRestore();
  // });

  // it("should return 200 for a valid user with default project, with free queue and assigned slot to same org", async () => {
  //   const links = await initializer.initLinksOrganization();
  //   const user = await initializer.initLinksUser();
  //   const project = await initializer.initFreeQueueProject(links, 0);
  //   const slot = await initializer.assignCurrentSlot(links);

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
  //     .expect(200);

  //   spy.mockRestore();
  // });

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

  // it("should return 200 for a user with same project as current reservation", async () => {
  //   const links = await initializer.initLinksOrganization();
  //   const user = await initializer.initLinksUser();
  //   const project = await initializer.initFreeQueueProject(links, 0);
  //   const slot = await initializer.assignCurrentSlot(links);
  //   const reservation = await initializer.addReservation(slot, project, user);

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
  //     .expect(200);

  //   spy.mockRestore();
  // });

  // it("should return 200 for a user with same project as current reservation even with different org", async () => {
  //   const links = await initializer.initLinksOrganization();
  //   const polito = await initializer.initPolitoOrganization();
  //   const politoUser = await initializer.initPolitoUser();
  //   const user = await initializer.initLinksUser();
  //   const project = await initializer.initFreeQueueProject(polito, 0);
  //   const slot = await initializer.assignCurrentSlot(polito);
  //   const reservation = await initializer.addReservation(
  //     slot,
  //     project,
  //     politoUser,
  //   );

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
  //     .expect(200);

  //   spy.mockRestore();
  // });

  // it("should return 403 for a different project than current reservation", async () => {
  //   const links = await initializer.initLinksOrganization();
  //   const user = await initializer.initLinksUser();
  //   const userProject = await initializer.initFreeQueueProject(links, 0);
  //   const reservationProject = await initializer.initFreeQueueProject(links, 0);
  //   const slot = await initializer.assignCurrentSlot(links);
  //   const reservation = await initializer.addReservation(
  //     slot,
  //     reservationProject,
  //     user,
  //   );

  //   await initializer.addUserToProject(user, userProject);
  //   await initializer.addDefaultProjectToUser(user, userProject);

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
  //     .send({ project_name: userProject.name })
  //     .expect(403);

  //   expect(res.body).toHaveProperty(
  //     "message",
  //     `Slot reserved to another project`,
  //   );

  //   spy.mockRestore();
  // });

  // it("should return 200 if a project is not provided but user is part of current reservation's project", async () => {
  //   const links = await initializer.initLinksOrganization();
  //   const polito = await initializer.initPolitoOrganization();
  //   const politoUser = await initializer.initPolitoUser();
  //   const user = await initializer.initLinksUser();
  //   const project = await initializer.initFreeQueueProject(polito, 0);
  //   const anotherProject = await initializer.initFreeQueueProject(links, 0);
  //   const slot = await initializer.assignCurrentSlot(polito);
  //   const reservation = await initializer.addReservation(
  //     slot,
  //     project,
  //     politoUser,
  //   );

  //   await initializer.addUserToProject(user, project);
  //   await initializer.addDefaultProjectToUser(user, anotherProject);

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
  //     .expect(200);

  //   spy.mockRestore();
  // });
});
