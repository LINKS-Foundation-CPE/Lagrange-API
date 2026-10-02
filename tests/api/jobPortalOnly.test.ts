import request from "supertest";
import dataInitializer from "../utils/dataInitializer.ts";
import * as repo from "../../src/repositories/job.repository.ts";
import * as projectRepo from "../../src/repositories/project.repository.ts";
import * as budgetEventRepo from "../../src/repositories/budgetEvent.repository.ts";
import { createApp } from "../../src/app.ts";
import { generateValidAdminToken } from "../utils/tokenUtils.ts";

/**
 * JOB_PORTAL_ONLY (src/config/policy.ts): the portal becomes a job viewer —
 * the management surface is not mounted and nothing is billed. Default off.
 *
 * Route mounting happens once, when the app is built, so these cases build
 * their own app with the flag set rather than using the suite's shared one.
 */

const FLAG = "JOB_PORTAL_ONLY";

// The flag is read at two different times: route mounting happens once when the
// app is built, while /config and the billing decision read the environment per
// request. So the flag stays set for the whole case, as it would be in a real
// deployment, and is cleared afterwards.
const withFlag = async (
  enabled: boolean,
  body: (app: ReturnType<typeof createApp>) => Promise<void>,
) => {
  if (enabled) {
    process.env[FLAG] = "true";
  } else {
    delete process.env[FLAG];
  }
  try {
    await body(createApp(global.__SEQUELIZE__));
  } finally {
    delete process.env[FLAG];
  }
};

describe("JOB_PORTAL_ONLY", () => {
  const initializer = new dataInitializer();

  it("does not mount the management surface, even for an admin", async () => {
    await withFlag(true, async (app) => {
      // Authenticated as an admin on purpose: 404 then means the route is gone
      // rather than merely refused. An unauthenticated probe would only ever
      // see the 401 from the /api-wide auth middleware.
      const token = generateValidAdminToken();
      for (const path of [
        "/api/users",
        "/api/projects",
        "/api/organizations",
        "/api/slots",
        "/api/reservations",
        "/api/logs",
        "/api/budgetEvents",
        "/api/reports/jobs",
        "/api/reports/summary",
        "/api/tags",
        "/api/announcements",
        "/api/notifications",
        "/api/projects_users",
        "/api/own/projects",
      ]) {
        await request(app)
          .get(path)
          .set("Authorization", `Bearer ${token}`)
          .expect(404);
      }
      // Outside /api, so no auth middleware to mask it.
      await request(app).post("/jobAuthorizer").send({}).expect(404);
    });
  });

  it("keeps the routes a job viewer needs", async () => {
    await withFlag(true, async (app) => {
      // Reachable for an authenticated user: not 404.
      const token = generateValidAdminToken();
      const jobs = await request(app)
        .get("/api/jobs")
        .set("Authorization", `Bearer ${token}`);
      expect(jobs.status).not.toEqual(404);
      // Public, and it tells the client which mode this deployment is in.
      const res = await request(app).get("/config").expect(200);
      expect(res.body.jobPortalOnly).toBe(true);
      // The machine endpoints that populate the job list stay reachable.
      await request(app).post("/jobReport").send({}).expect(400);
      await request(app).get("/metrics/jobs").expect(200);
    });
  });

  it("mounts everything by default", async () => {
    await withFlag(false, async (app) => {
      const token = generateValidAdminToken();
      const projects = await request(app)
        .get("/api/projects")
        .set("Authorization", `Bearer ${token}`);
      expect(projects.status).not.toEqual(404);
      const res = await request(app).get("/config").expect(200);
      expect(res.body.jobPortalOnly).toBe(false);
    });
  });

  it("records a job but bills nothing", async () => {
    const org = await initializer.initPolitoOrganization();
    const user = await initializer.initPolitoUser();
    const project = await initializer.initNoFreeQueueProject(org, 1_000_000);
    const job = await repo.create({
      jobid: `portal-${Math.floor(Math.random() * 1_000_000)}`,
      organization_id: org.id,
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

    const eventsBefore = await budgetEventRepo.getList({});
    process.env[FLAG] = "true";
    try {
      await request(global.__APP__)
        .put(`/jobReport/${job.jobid}`)
        .send({
          status: "ready",
          execution_start: "2026-07-29T12:00:00.000Z",
          execution_end: "2026-07-29T12:00:05.000Z",
        })
        .expect(200);
    } finally {
      delete process.env[FLAG];
    }

    const after = await projectRepo.getOne(project.id);
    expect(Number(after!.remaining_budget)).toEqual(1_000_000);
    const eventsAfter = await budgetEventRepo.getList({});
    expect(eventsAfter.count).toEqual(eventsBefore.count);

    // The job itself is still recorded — that is the whole point of the mode.
    const updated = await repo.getByJobid(job.jobid);
    expect(updated!.status).toEqual("ready");
    expect(updated!.execution_start).not.toBeNull();
    expect(updated!.execution_end).not.toBeNull();
  });
});
