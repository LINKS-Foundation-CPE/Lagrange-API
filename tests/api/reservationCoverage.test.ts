import request from "supertest";
import dataInitializer from "../utils/dataInitializer.ts";
import * as reservationRepo from "../../src/repositories/reservation.repository.ts";
import * as jobRepo from "../../src/repositories/job.repository.ts";
import { BudgetEvent, Project } from "../../src/models/index.ts";
import { coveredMs } from "../../src/services/reservationCoverage.ts";
import {
  applyReservationRefund,
  planReservationRefund,
} from "../../src/services/reservationRefund.service.ts";
import { generateToken, validHeader } from "../utils/tokenUtils.ts";

/**
 * Reservation coverage is decided by when a job EXECUTED, against its own
 * project's reservations, and only the part outside them is billed.
 *
 * The fixture reproduces the case that exposed the bug: project 45's
 * reservation 151, 2026-11-17T23:00Z -> 2026-11-18T02:00Z, and six jobs
 * submitted just before it that ran inside it.
 */

const at = (iso: string) => new Date(iso);
const RES_START = "2026-11-17T23:00:00.000Z";
const RES_END = "2026-11-18T02:00:00.000Z";

describe("coveredMs (half-open intervals)", () => {
  const job = (s: string, e: string) => ({ start: at(s), end: at(e) });
  const res = [job(RES_START, RES_END)];

  it("is zero for a job ending exactly when the reservation starts", () => {
    expect(coveredMs(job("2026-11-17T22:59:00Z", RES_START), res)).toBe(0);
  });
  it("is zero for a job starting exactly when the reservation ends", () => {
    expect(coveredMs(job(RES_END, "2026-11-18T02:01:00Z"), res)).toBe(0);
  });
  it("is the overlap for a job straddling the start", () => {
    expect(
      coveredMs(job("2026-11-17T22:59:00Z", "2026-11-17T23:01:00Z"), res),
    ).toBe(60_000);
  });
  it("is the overlap for a job straddling the end", () => {
    expect(
      coveredMs(job("2026-11-18T01:59:00Z", "2026-11-18T02:03:00Z"), res),
    ).toBe(60_000);
  });
  it("is everything for a job wholly inside", () => {
    expect(
      coveredMs(job("2026-11-17T23:10:00Z", "2026-11-17T23:12:00Z"), res),
    ).toBe(120_000);
  });
  it("never counts overlapping blocks twice", () => {
    const j = job("2026-11-17T23:00:00Z", "2026-11-17T23:10:00Z");
    expect(coveredMs(j, [j, j])).toBe(600_000);
  });
  it("is zero for an inverted window", () => {
    expect(coveredMs(job(RES_END, RES_START), res)).toBe(0);
  });
});

describe("billing by execution window", () => {
  const initializer = new dataInitializer();
  let user: Awaited<ReturnType<typeof initializer.initUser>>;
  let projectA: Awaited<ReturnType<typeof initializer.initNoFreeQueueProject>>;
  let projectB: Awaited<ReturnType<typeof initializer.initNoFreeQueueProject>>;
  let reservationA: Awaited<ReturnType<typeof reservationRepo.create>>;
  let n = 0;

  beforeEach(async () => {
    const suffix = Math.floor(Math.random() * 1_000_000);
    const orgA = await initializer.initOrganization(`CovOrgA-${suffix}`);
    const orgB = await initializer.initOrganization(`CovOrgB-${suffix}`);
    projectA = await initializer.initNoFreeQueueProject(orgA, 100_000_000);
    projectB = await initializer.initNoFreeQueueProject(orgB, 100_000_000);
    user = await initializer.initUser({
      email: `coverage-${suffix}@example.com`,
      sub: `coverage-sub-${suffix}`,
      organization_id: orgA.id,
    });
    await initializer.addUserToProject(user, projectA);
    await initializer.addUserToProject(user, projectB);
    reservationA = await reservationRepo.create({
      project_id: projectA.id,
      slot_id: null,
      day: at("2026-11-17T00:00:00.000Z"),
      start: at(RES_START),
      end: at(RES_END),
      made_by: user.id,
      description: null,
    });
  });

  /** Submit, then report the terminal state, as the gateway does. */
  const runJob = async (
    project: { name: string },
    submitted: string,
    start: string,
    end: string,
  ) => {
    const jobid = `cov-job-${++n}-${Math.floor(Math.random() * 1e9)}`;
    await request(global.__APP__)
      .post("/jobReport")
      .send({
        project_name: project.name,
        username: user.email,
        jobid,
        submitted_datetime: submitted,
      })
      .expect(200);
    await request(global.__APP__)
      .put(`/jobReport/${jobid}`)
      .send({ status: "completed", execution_start: start, execution_end: end })
      .expect(200);
    const job = await jobRepo.getByJobid(jobid);
    const charges = await BudgetEvent.findAll({
      where: { project_id: job!.project_id },
    });
    const charge = charges.find((c) =>
      c.description.startsWith(`Job ${jobid} (`),
    );
    return { job: job!, charge };
  };

  it("bills nothing for a job submitted before a reservation and run wholly inside it", async () => {
    const { job, charge } = await runJob(
      projectA,
      "2026-11-17T22:55:00Z",
      "2026-11-17T23:10:00Z",
      "2026-11-17T23:12:00Z",
    );
    expect(charge).toBeUndefined();
    expect(job.usedReservation).toBe(true);
    expect(job.reservation_ids).toEqual([reservationA.id]);
    expect(job.reservation_covered_ms).toBe(120_000);
  });

  it("bills only the part before a reservation's start", async () => {
    const { job, charge } = await runJob(
      projectA,
      "2026-11-17T22:53:50Z",
      "2026-11-17T22:58:56Z",
      "2026-11-17T23:03:09Z",
    );
    expect(Number(charge!.value)).toBe(-64_000);
    expect(charge!.description).toContain(
      `189000 ms inside reservation ${reservationA.id} not billed, 64000 ms billed`,
    );
    expect(charge!.description).toContain("2026-11-17T22:58:56Z");
    expect(charge!.description).not.toContain("GMT");
    expect(job.usedReservation).toBe(true);
    expect(job.reservation_ids).toEqual([reservationA.id]);
    expect(job.reservation_covered_ms).toBe(189_000);
  });

  it("bills only the part after a reservation's end", async () => {
    const { charge } = await runJob(
      projectA,
      "2026-11-18T01:50:00Z",
      "2026-11-18T01:59:00Z",
      "2026-11-18T02:03:00Z",
    );
    expect(Number(charge!.value)).toBe(-180_000);
  });

  it("bills a job wholly outside any reservation as before", async () => {
    const { job, charge } = await runJob(
      projectA,
      "2026-11-17T22:29:00Z",
      "2026-11-17T22:30:00Z",
      "2026-11-17T22:31:00Z",
    );
    expect(Number(charge!.value)).toBe(-60_000);
    expect(job.usedReservation).toBe(false);
    expect(job.reservation_ids).toBeNull();
    expect(job.reservation_covered_ms).toBeNull();
  });

  it("bills a project's job run during another project's reservation in full", async () => {
    // Submitted during A's reservation, but it is B's job.
    const { job, charge } = await runJob(
      projectB,
      "2026-11-17T23:05:00Z",
      "2026-11-17T23:10:00Z",
      "2026-11-17T23:12:00Z",
    );
    expect(job.project_id).toBe(projectB.id);
    expect(Number(charge!.value)).toBe(-120_000);
    expect(job.usedReservation).toBe(false);
    expect(job.reservation_ids).toBeNull();
  });

  it("regression: the six jobs of reservation 151 cost only the 64 s before it", async () => {
    const before = Number(
      (await Project.findByPk(projectA.id))!.remaining_budget,
    );
    const six = [
      ["22:53:50", "22:58:56", "23:03:09"],
      ["22:54:19", "23:03:09", "23:03:19"],
      ["22:54:08", "23:03:19", "23:07:32"],
      ["22:54:40", "23:07:32", "23:07:42"],
      ["22:57:07", "23:07:42", "23:09:46"],
      ["22:59:25", "23:09:46", "23:11:49"],
    ];
    const results = [];
    for (const [submitted, start, end] of six) {
      results.push(
        await runJob(
          projectA,
          `2026-11-17T${submitted}Z`,
          `2026-11-17T${start}Z`,
          `2026-11-17T${end}Z`,
        ),
      );
    }
    expect(results.every((r) => r.job.usedReservation)).toBe(true);
    const charged = results.filter((r) => r.charge);
    expect(charged).toHaveLength(1);
    expect(Number(charged[0].charge!.value)).toBe(-64_000);
    const after = Number(
      (await Project.findByPk(projectA.id))!.remaining_budget,
    );
    expect(before - after).toBe(64_000);
  });

  describe("reports follow the same rule", () => {
    const adminToken = () =>
      generateToken(validHeader, {
        id: 1,
        sub: "cov-admin",
        email: "cov-admin@test",
        roles: ["admin"],
        administeredProjects: [],
      });
    const report = (path: string) =>
      request(global.__APP__)
        .get(path)
        .query({ from: "2026-11-17T00:00:00Z", to: "2026-11-19T00:00:00Z" })
        .set("Authorization", `Bearer ${adminToken()}`)
        .expect(200);

    beforeEach(async () => {
      await runJob(
        projectA,
        "2026-11-17T22:53:50Z",
        "2026-11-17T22:58:56Z",
        "2026-11-17T23:03:09Z",
      ); // 64 s out, 189 s in
      await runJob(
        projectA,
        "2026-11-17T22:55:00Z",
        "2026-11-17T23:10:00Z",
        "2026-11-17T23:12:00Z",
      ); // 120 s in
      await runJob(
        projectA,
        "2026-11-17T22:29:00Z",
        "2026-11-17T22:30:00Z",
        "2026-11-17T22:31:00Z",
      ); // 60 s out
    });

    it("jobs: queue time is the execution outside the project's reservations", async () => {
      const res = await report("/api/reports/jobs");
      const row = res.body.find(
        (r: { project_id: number }) => r.project_id === projectA.id,
      );
      expect(row.count).toBe(2);
      expect(row.total_seconds).toBeCloseTo(124);
    });

    it("utilization: usage is the execution inside each block, straddlers included", async () => {
      const res = await report("/api/reports/utilization");
      const row = res.body.find(
        (r: { project_id: number }) => r.project_id === projectA.id,
      );
      expect(row.count).toBe(2);
      expect(row.usage_hours * 3600).toBeCloseTo(309);
      expect(row.reserved_hours).toBeCloseTo(3);
    });
  });

  describe("refund of time billed twice", () => {
    /** A job billed the old way: in full, flagged as outside. */
    const legacyBilled = async (jobid: string, start: string, end: string) => {
      const job = await jobRepo.create({
        project_id: projectA.id,
        organization_id: projectA.organization_id,
        user_id: user.id,
        jobid,
        status: "completed",
        execution_start: at(start),
        execution_end: at(end),
        submitted_datetime: at("2026-11-17T22:50:00Z"),
        results: null,
        submitted_circuit: null,
        usedReservation: false,
        job_type: "circuit",
        billable: null,
      });
      const ms = at(end).getTime() - at(start).getTime();
      const event = await BudgetEvent.create({
        project_id: projectA.id,
        value: -ms,
        billing: true,
        description: `Job ${jobid} (${job.id}) ${at(start)} - ${at(end)})`,
      });
      return { job, event };
    };

    it("refunds the inside part once, naming the billing transactions and the reservation", async () => {
      const a = await legacyBilled(
        "legacy-1",
        "2026-11-17T22:58:56Z",
        "2026-11-17T23:03:09Z",
      );
      const b = await legacyBilled(
        "legacy-2",
        "2026-11-17T23:03:09Z",
        "2026-11-17T23:03:19Z",
      );
      await legacyBilled(
        "legacy-out",
        "2026-11-17T22:30:00Z",
        "2026-11-17T22:31:00Z",
      );
      const budgetBefore = Number(
        (await Project.findByPk(projectA.id))!.remaining_budget,
      );

      const plan = await planReservationRefund(reservationA.id);
      expect(plan.lines.map((l) => l.jobid).sort()).toEqual([
        "legacy-1",
        "legacy-2",
      ]);
      expect(plan.total).toBe(189_000 + 10_000);

      const events = await applyReservationRefund(plan);
      expect(events).toHaveLength(1);
      const refund = await BudgetEvent.findByPk(events[0]);
      expect(Number(refund!.value)).toBe(199_000);
      expect(refund!.description).toContain(`tx ${a.event.id},${b.event.id}`);
      expect(refund!.description).toContain(`reservation ${reservationA.id}`);
      expect(
        Number((await Project.findByPk(projectA.id))!.remaining_budget),
      ).toBe(budgetBefore + 199_000);
      const legacy1 = (await jobRepo.getByJobid("legacy-1"))!;
      expect(legacy1.usedReservation).toBe(true);
      expect(legacy1.reservation_ids).toEqual([reservationA.id]);
      expect(legacy1.reservation_covered_ms).toBe(189_000);

      const again = await planReservationRefund(reservationA.id);
      expect(again.total).toBe(0);
      expect(again.already_refunded).toEqual(
        expect.arrayContaining([a.event.id, b.event.id]),
      );
    });

    it("refunds nothing for jobs billed under the current rule", async () => {
      await runJob(
        projectA,
        "2026-11-17T22:53:50Z",
        "2026-11-17T22:58:56Z",
        "2026-11-17T23:03:09Z",
      );
      const plan = await planReservationRefund(reservationA.id);
      expect(plan.total).toBe(0);
    });
  });
});
