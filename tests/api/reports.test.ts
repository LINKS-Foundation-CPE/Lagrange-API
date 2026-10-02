import request from "supertest";
import dataInitializer from "../utils/dataInitializer.ts";
import * as reservationRepo from "../../src/repositories/reservation.repository.ts";
import { generateToken, validHeader } from "../utils/tokenUtils.ts";

/**
 * Billing reports (`/api/reports`).
 *
 * The metric definitions are the point of these tests: which rows fall inside
 * a period, which are excluded because they were already billed as reserved
 * time, and which organization a row is attributed to. The numbers on an
 * invoice come from here.
 */

const FROM = "2026-01-01T00:00:00.000Z";
const TO = "2026-02-01T00:00:00.000Z";

const at = (iso: string) => new Date(iso);

const tokenFor = (roles: string[], organizationId?: number) =>
  generateToken(validHeader, {
    id: 1,
    sub: "reports-sub",
    email: "reports@test",
    roles,
    organization: organizationId ? { id: organizationId } : undefined,
    administeredProjects: [],
  });

const get = (path: string, token: string, query: Record<string, string>) =>
  request(global.__APP__)
    .get(path)
    .query(query)
    .set("Authorization", `Bearer ${token}`);

describe("GET /api/reports", () => {
  const initializer = new dataInitializer();

  let orgA: Awaited<ReturnType<typeof initializer.initOrganization>>;
  let orgB: Awaited<ReturnType<typeof initializer.initOrganization>>;
  let projectA: Awaited<ReturnType<typeof initializer.initNoFreeQueueProject>>;
  let projectB: Awaited<ReturnType<typeof initializer.initNoFreeQueueProject>>;
  let adminToken: string;

  // Per test, not per suite: the shared setup truncates every table before
  // each case, so fixtures built once would be gone by the first assertion.
  beforeEach(async () => {
    const suffix = Math.floor(Math.random() * 1_000_000);
    orgA = await initializer.initOrganization(`ReportOrgA-${suffix}`);
    orgB = await initializer.initOrganization(`ReportOrgB-${suffix}`);
    projectA = await initializer.initNoFreeQueueProject(orgA, 1_000_000);
    projectB = await initializer.initNoFreeQueueProject(orgB, 1_000_000);
    const user = await initializer.initUser({
      email: `reporter-${suffix}@example.com`,
      sub: `reporter-sub-${suffix}`,
      organization_id: orgA.id,
    });
    adminToken = tokenFor(["admin"]);

    // Queue jobs for project A: 1 h and 30 min, both wholly inside the period.
    await initializer.initJob({
      project: projectA,
      user,
      org: orgA,
      execution_start: at("2026-01-05T10:00:00.000Z"),
      execution_end: at("2026-01-05T11:00:00.000Z"),
    });
    await initializer.initJob({
      project: projectA,
      user,
      org: orgA,
      execution_start: at("2026-01-06T10:00:00.000Z"),
      execution_end: at("2026-01-06T10:30:00.000Z"),
    });
    // Straddles the closing edge: belongs to no period, so it is counted in none.
    await initializer.initJob({
      project: projectA,
      user,
      org: orgA,
      execution_start: at("2026-01-31T23:30:00.000Z"),
      execution_end: at("2026-02-01T00:30:00.000Z"),
    });
    // Ran inside a reservation: billed as reserved hours, never as queue hours.
    await initializer.initJob({
      project: projectA,
      user,
      org: orgA,
      usedReservation: true,
      execution_start: at("2026-01-10T09:15:00.000Z"),
      execution_end: at("2026-01-10T09:45:00.000Z"),
    });
    // A second organization, to prove scoping and grouping keep them apart.
    await initializer.initJob({
      project: projectB,
      user,
      org: orgB,
      execution_start: at("2026-01-07T08:00:00.000Z"),
      execution_end: at("2026-01-07T10:00:00.000Z"),
    });

    // A 2 h reservation for project A, holding the 30 min job above.
    await reservationRepo.create({
      project_id: projectA.id,
      slot_id: null,
      day: at("2026-01-10T00:00:00.000Z"),
      start: at("2026-01-10T09:00:00.000Z"),
      end: at("2026-01-10T11:00:00.000Z"),
      made_by: user.id,
      description: null,
    });

    // A 3 h slot for organization A.
    await initializer.assignCurrentSlot(orgA, 0, 0).catch(() => undefined);
  });

  const rowFor = (rows: Record<string, unknown>[], projectId: number) =>
    rows.find((r) => r.project_id === projectId);

  describe("jobs", () => {
    it("counts queue jobs whole-in-period and reports their hours", async () => {
      const res = await get("/api/reports/jobs", adminToken, {
        from: FROM,
        to: TO,
      }).expect(200);
      const row = rowFor(res.body, projectA.id)!;
      expect(row.count).toEqual(2);
      expect(row.total_hours).toBeCloseTo(1.5, 6);
    });

    it("excludes jobs that ran inside a reservation", async () => {
      const res = await get("/api/reports/jobs", adminToken, {
        from: FROM,
        to: TO,
      }).expect(200);
      // 3 h of execution exists for project A; only the 1.5 h of queue jobs is
      // reported. The 30 min in-reservation job and the boundary job are not.
      expect(rowFor(res.body, projectA.id)!.total_hours).toBeCloseTo(1.5, 6);
    });

    it("groups by organization through the project", async () => {
      const res = await get("/api/reports/jobs", adminToken, {
        from: FROM,
        to: TO,
        group_by: "organization",
      }).expect(200);
      const a = res.body.find(
        (r: Record<string, unknown>) => r.organization_id === orgA.id,
      );
      const b = res.body.find(
        (r: Record<string, unknown>) => r.organization_id === orgB.id,
      );
      expect(a.total_hours).toBeCloseTo(1.5, 6);
      expect(a.project_id).toBeNull();
      expect(b.total_hours).toBeCloseTo(2, 6);
    });
  });

  describe("reservations", () => {
    it("reports blocks lying entirely in the period", async () => {
      const res = await get("/api/reports/reservations", adminToken, {
        from: FROM,
        to: TO,
      }).expect(200);
      const row = rowFor(res.body, projectA.id)!;
      expect(row.count).toEqual(1);
      expect(row.total_hours).toBeCloseTo(2, 6);
    });

    it("excludes a block that starts before the period", async () => {
      const res = await get("/api/reports/reservations", adminToken, {
        from: "2026-01-10T09:30:00.000Z",
        to: TO,
      }).expect(200);
      expect(rowFor(res.body, projectA.id)).toBeUndefined();
    });
  });

  describe("utilization", () => {
    it("is the used fraction of the reserved time", async () => {
      const res = await get("/api/reports/utilization", adminToken, {
        from: FROM,
        to: TO,
      }).expect(200);
      const row = rowFor(res.body, projectA.id)!;
      expect(row.reserved_hours).toBeCloseTo(2, 6);
      expect(row.usage_hours).toBeCloseTo(0.5, 6);
      expect(row.utilization).toBeCloseTo(0.25, 6);
      expect(row.count).toEqual(1);
    });
  });

  describe("access", () => {
    it("scopes an organization manager to their own organization", async () => {
      const res = await get(
        "/api/reports/jobs",
        tokenFor(["organization-manager"], orgA.id),
        { from: FROM, to: TO, group_by: "organization" },
      ).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].organization_id).toEqual(orgA.id);
    });

    it("refuses a caller with no reporting role", async () => {
      await get("/api/reports/jobs", tokenFor(["project-admin"]), {
        from: FROM,
        to: TO,
      }).expect(403);
    });
  });

  describe("period", () => {
    it("rejects a period that ends before it starts", async () => {
      await get("/api/reports/jobs", adminToken, {
        from: TO,
        to: FROM,
      }).expect(400);
    });

    it("requires both bounds", async () => {
      await get("/api/reports/jobs", adminToken, { from: FROM }).expect(400);
    });

    it("reads a bare date as midnight UTC", async () => {
      const res = await get("/api/reports/jobs", adminToken, {
        from: "2026-01-01",
        to: "2026-02-01",
      }).expect(200);
      expect(rowFor(res.body, projectA.id)!.total_hours).toBeCloseTo(1.5, 6);
    });
  });

  describe("summary", () => {
    it("returns every section for one period", async () => {
      const res = await get("/api/reports/summary", adminToken, {
        from: FROM,
        to: TO,
      }).expect(200);
      expect(Object.keys(res.body)).toEqual(
        expect.arrayContaining([
          "period",
          "reservations",
          "jobs",
          "slots",
          "utilization",
        ]),
      );
      expect(res.body.jobs.by_organization.length).toBeGreaterThan(0);
    });
  });
});
