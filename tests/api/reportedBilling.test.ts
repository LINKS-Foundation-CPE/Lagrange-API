import request from "supertest";
import dataInitializer from "../utils/dataInitializer.ts";
import * as repo from "../../src/repositories/job.repository.ts";
import * as projectRepo from "../../src/repositories/project.repository.ts";
import * as budgetEventRepo from "../../src/repositories/budgetEvent.repository.ts";

/**
 * ACCEPT_REPORTED_BILLING (src/config/policy.ts): when enabled, the terminal
 * `PUT /jobReport/{jobid}` may carry a `billable` amount and that amount is
 * charged instead of `execution_end - execution_start`. Default off, so a
 * deployment that bills the execution window is unaffected.
 *
 * The flag is read from process.env on every access, so each test sets and
 * clears it explicitly.
 */

const FLAG = "ACCEPT_REPORTED_BILLING";

afterEach(() => {
  delete process.env[FLAG];
});

const initializer = new dataInitializer();

const makeJob = async (budget: number) => {
  const org = await initializer.initPolitoOrganization();
  const user = await initializer.initPolitoUser();
  const project = await initializer.initNoFreeQueueProject(org, budget);
  const job = await repo.create({
    jobid: `job-${Math.floor(Math.random() * 1_000_000)}`,
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
  return { project, job };
};

describe("ACCEPT_REPORTED_BILLING", () => {
  it("ignores a reported amount when the flag is off, and bills the window", async () => {
    const { project, job } = await makeJob(1_000_000);

    await request(global.__APP__)
      .put(`/jobReport/${job.jobid}`)
      .send({
        status: "ready",
        // 1 s window, so the historical behaviour bills 1000 ms
        execution_start: "2026-07-29T12:00:00.000Z",
        execution_end: "2026-07-29T12:00:01.000Z",
        billable: 42,
      })
      .expect(200);

    const after = await projectRepo.getOne(project.id);
    expect(Number(after!.remaining_budget)).toEqual(1_000_000 - 1000);

    const updated = await repo.getByJobid(job.jobid);
    expect(updated!.billable).toBeNull();
  });

  it("bills the reported amount when the flag is on", async () => {
    process.env[FLAG] = "true";
    const { project, job } = await makeJob(1_000_000);

    const before = await budgetEventRepo.getList({});

    await request(global.__APP__)
      .put(`/jobReport/${job.jobid}`)
      .send({ status: "ready", billable: 12_345 })
      .expect(200);

    const after = await projectRepo.getOne(project.id);
    expect(Number(after!.remaining_budget)).toEqual(1_000_000 - 12_345);

    const events = await budgetEventRepo.getList({});
    expect(events.count).toEqual(before.count + 1);

    const updated = await repo.getByJobid(job.jobid);
    expect(Number(updated!.billable)).toEqual(12_345);
  });

  it("prefers the reported amount over the execution window", async () => {
    process.env[FLAG] = "true";
    const { project, job } = await makeJob(1_000_000);

    await request(global.__APP__)
      .put(`/jobReport/${job.jobid}`)
      .send({
        status: "ready",
        execution_start: "2026-07-29T12:00:00.000Z",
        execution_end: "2026-07-29T12:00:01.000Z",
        billable: 7,
      })
      .expect(200);

    const after = await projectRepo.getOne(project.id);
    expect(Number(after!.remaining_budget)).toEqual(1_000_000 - 7);
  });

  it("still bills the window when the flag is on but no amount is reported", async () => {
    process.env[FLAG] = "true";
    const { project, job } = await makeJob(1_000_000);

    await request(global.__APP__)
      .put(`/jobReport/${job.jobid}`)
      .send({
        status: "ready",
        execution_start: "2026-07-29T12:00:00.000Z",
        execution_end: "2026-07-29T12:00:02.000Z",
      })
      .expect(200);

    const after = await projectRepo.getOne(project.id);
    expect(Number(after!.remaining_budget)).toEqual(1_000_000 - 2000);
  });

  it("bills a reported amount exactly once, even with no timestamps to guard on", async () => {
    process.env[FLAG] = "true";
    const { project, job } = await makeJob(1_000_000);

    await request(global.__APP__)
      .put(`/jobReport/${job.jobid}`)
      .send({ status: "ready", billable: 500 })
      .expect(200);
    await request(global.__APP__)
      .put(`/jobReport/${job.jobid}`)
      .send({ status: "ready", billable: 500 })
      .expect(200);

    const after = await projectRepo.getOne(project.id);
    expect(Number(after!.remaining_budget)).toEqual(1_000_000 - 500);
  });

  it("does not bill a free-queue project, reported amount or not", async () => {
    process.env[FLAG] = "true";
    const org = await initializer.initPolitoOrganization();
    const user = await initializer.initPolitoUser();
    const project = await initializer.initFreeQueueProject(org);
    const job = await repo.create({
      jobid: `job-free-${Math.floor(Math.random() * 1_000_000)}`,
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

    const before = await budgetEventRepo.getList({});

    await request(global.__APP__)
      .put(`/jobReport/${job.jobid}`)
      .send({ status: "ready", billable: 999 })
      .expect(200);

    const events = await budgetEventRepo.getList({});
    expect(events.count).toEqual(before.count);
  });

  it("rejects a negative or fractional amount", async () => {
    process.env[FLAG] = "true";
    const { job } = await makeJob(1_000_000);

    await request(global.__APP__)
      .put(`/jobReport/${job.jobid}`)
      .send({ status: "ready", billable: -1 })
      .expect(400);
    await request(global.__APP__)
      .put(`/jobReport/${job.jobid}`)
      .send({ status: "ready", billable: 1.5 })
      .expect(400);
  });
});
