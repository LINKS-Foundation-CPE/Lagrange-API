import request from "supertest";
import dataInitializer from "../utils/dataInitializer.ts";
import * as reservationRepo from "../../src/repositories/reservation.repository.ts";
import * as jobRepo from "../../src/repositories/job.repository.ts";
import { BudgetEvent, Project, User } from "../../src/models/index.ts";

/**
 * QPU sessions: per-user grant and cap, charged up front like a reservation,
 * refused near another project's reservation, jobs inside not charged, and a
 * refund only for a session that never started.
 */
describe("QPU sessions", () => {
  const initializer = new dataInitializer();
  let user: User;
  let project: Awaited<ReturnType<typeof initializer.initNoFreeQueueProject>>;
  let other: Awaited<ReturnType<typeof initializer.initNoFreeQueueProject>>;
  let n = 0;

  beforeEach(async () => {
    const suffix = Math.floor(Math.random() * 1_000_000);
    const org = await initializer.initOrganization(`SessOrg-${suffix}`);
    const org2 = await initializer.initOrganization(`SessOrg2-${suffix}`);
    project = await initializer.initNoFreeQueueProject(org, 10_000_000);
    other = await initializer.initNoFreeQueueProject(org2, 10_000_000);
    user = await initializer.initUser({
      email: `session-${suffix}@example.com`,
      sub: `session-sub-${suffix}`,
      organization_id: org.id,
    });
    await initializer.addUserToProject(user, project);
  });

  const grant = (max: number | null = null) =>
    user.update({ session_access: true, session_max_seconds: max });
  const authorize = (requested: number) =>
    request(global.__APP__).post("/sessionAuthorizer").send({
      username: user.email,
      project_name: project.name,
      requested_seconds: requested,
      default_max_seconds: 600,
    });
  const open = (granted: number, id = `iter-${++n}-${Math.random()}`) =>
    request(global.__APP__)
      .post("/sessionReport")
      .send({
        username: user.email,
        project_name: project.name,
        session_id: id,
        session_kind: "iteration",
        granted_seconds: granted,
        opened_at: new Date().toISOString(),
      })
      .then((r) => ({ r, id }));
  const budget = async () =>
    Number((await Project.findByPk(project.id))!.remaining_budget);
  const reserve = (projectId: number, startInMin: number, endInMin: number) =>
    reservationRepo.create({
      project_id: projectId,
      slot_id: null,
      day: new Date(),
      start: new Date(Date.now() + startInMin * 60_000),
      end: new Date(Date.now() + endInMin * 60_000),
      made_by: user.id,
      description: null,
    });

  it("refuses a user without session access", async () => {
    const res = await authorize(600);
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("does not have session access");
  });

  it("caps at the user's own limit if set, else the deployment default", async () => {
    await grant(300);
    const res = await authorize(900);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      granted_seconds: 300,
      project_name: project.name,
      charge_ms: 300_000,
    });
    await grant(null);
    expect((await authorize(900)).body.granted_seconds).toBe(600);
    // a user's own limit can be above the default
    await grant(1200);
    expect((await authorize(900)).body.granted_seconds).toBe(900);
    expect((await authorize(5000)).body.granted_seconds).toBe(1200);
  });

  it("refuses when the budget does not cover the granted time", async () => {
    await grant();
    await project.update({ remaining_budget: 100_000 });
    const res = await authorize(600);
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("Insufficient budget");
  });

  it("refuses a session that would overlap another project's reservation", async () => {
    await grant();
    await reserve(other.id, 5, 65);
    const res = await authorize(600);
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("reservation of another project");
    expect((await authorize(240)).status).toBe(200); // ends before it starts
  });

  it("does not charge the part inside the project's own reservation", async () => {
    await grant();
    await reserve(project.id, -10, 5); // covers the first 5 of 10 minutes
    const res = await authorize(600);
    expect(res.status).toBe(200);
    expect(res.body.charge_ms).toBeGreaterThan(290_000);
    expect(res.body.charge_ms).toBeLessThan(310_000);
  });

  it("charges the granted time once, up front, and records the session", async () => {
    await grant();
    const before = await budget();
    const { r, id } = await open(600);
    expect(r.status).toBe(200);
    expect(await budget()).toBe(before - 600_000);
    const row = (await jobRepo.getByJobid(id))!;
    expect(row.is_session).toBe(true);
    expect(row.job_type).toBe("iteration");
    expect(Number(row.billable)).toBe(600_000);
    const events = await BudgetEvent.findAll({
      where: { project_id: project.id },
    });
    expect(
      events.some((e) => e.description.startsWith(`Session iteration ${id}`)),
    ).toBe(true);

    // a retried report does not charge again
    await request(global.__APP__)
      .post("/sessionReport")
      .send({
        username: user.email,
        project_name: project.name,
        session_id: id,
        session_kind: "iteration",
        granted_seconds: 600,
        opened_at: new Date().toISOString(),
      })
      .expect(200);
    expect(await budget()).toBe(before - 600_000);
  });

  it("does not charge jobs run inside a session", async () => {
    await grant();
    const { id } = await open(600);
    const before = await budget();
    const jobid = `in-session-${Math.random()}`;
    await request(global.__APP__)
      .post("/jobReport")
      .send({
        project_name: project.name,
        username: user.email,
        jobid,
        submitted_datetime: new Date().toISOString(),
        session_id: id,
        session_kind: "iteration",
      })
      .expect(200);
    const t0 = Date.now();
    await request(global.__APP__)
      .put(`/jobReport/${jobid}`)
      .send({
        status: "completed",
        execution_start: new Date(t0).toISOString(),
        execution_end: new Date(t0 + 5_000).toISOString(),
      })
      .expect(200);
    expect(await budget()).toBe(before);
    const job = (await jobRepo.getByJobid(jobid))!;
    expect(job.session_id).toBe(id);
    expect(job.session_kind).toBe("iteration");
  });

  it("refunds the unused time when it ends early, idle time included in the charge", async () => {
    await grant();
    const before = await budget();
    const { id } = await open(600);
    expect(await budget()).toBe(before - 600_000);
    const t0 = Date.now();
    await request(global.__APP__)
      .put(`/jobReport/${id}`)
      .send({ status: "active", execution_start: new Date(t0).toISOString() })
      .expect(200);
    expect(await budget()).toBe(before - 600_000); // not settled until it ends
    await request(global.__APP__)
      .put(`/jobReport/${id}`)
      .send({
        status: "completed",
        execution_end: new Date(t0 + 90_000).toISOString(),
      })
      .expect(200);
    expect(await budget()).toBe(before - 90_000);
    const row = (await jobRepo.getByJobid(id))!;
    expect(row.status).toBe("completed");
    expect(Number(row.billable)).toBe(90_000);
    // a repeated terminal report settles nothing twice
    await request(global.__APP__)
      .put(`/jobReport/${id}`)
      .send({
        status: "completed",
        execution_end: new Date(t0 + 90_000).toISOString(),
      })
      .expect(200);
    expect(await budget()).toBe(before - 90_000);
  });

  it("keeps the whole charge for a session that ran its full time", async () => {
    await grant();
    const before = await budget();
    const { id } = await open(600);
    const t0 = Date.now();
    await request(global.__APP__)
      .put(`/jobReport/${id}`)
      .send({
        status: "completed",
        execution_start: new Date(t0).toISOString(),
        execution_end: new Date(t0 + 600_000).toISOString(),
      })
      .expect(200);
    expect(await budget()).toBe(before - 600_000);
  });

  it("refunds a session that ended without ever starting, once", async () => {
    await grant();
    const before = await budget();
    const { id } = await open(600);
    await request(global.__APP__)
      .put(`/jobReport/${id}`)
      .send({ status: "cancelled" })
      .expect(200);
    expect(await budget()).toBe(before);
    await request(global.__APP__)
      .put(`/jobReport/${id}`)
      .send({ status: "cancelled" })
      .expect(200);
    expect(await budget()).toBe(before);
  });

  it("only an administrator can grant session access", async () => {
    // covered by the same guard as pulse access: a non-admin update drops the fields
    const { default: svc } = await import(
      "../../src/services/user.service.ts"
    ).then((m) => ({ default: m }));
    await svc.update(
      user.id,
      { session_access: true, session_max_seconds: 999 },
      {
        id: user.id,
        roles: ["user"],
        organization: null,
      } as never,
    );
    const fresh = (await User.findByPk(user.id))!;
    expect(fresh.session_access).toBe(false);
  });
});
