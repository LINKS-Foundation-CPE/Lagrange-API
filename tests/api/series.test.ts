import request from "supertest";
import jwt from "jsonwebtoken";
import { DateTime } from "luxon";
import {
  validHeader,
  generateToken,
  randomSignature,
} from "../utils/tokenUtils.ts";
import dataInitializer from "../utils/dataInitializer.ts";
import * as slotRepo from "../../src/repositories/slot.repository.ts";
import {
  BudgetEvent,
  Notification,
  Organization,
  Project,
  Reservation,
  Slot,
  User,
} from "../../src/models/index.ts";

/**
 * Recurring series of slots and reservations: preview, create, refuse, delete.
 *
 * Every series here is three Tuesdays, starting the week after next so that no
 * occurrence is ever in the past whenever the suite runs.
 */
const ZONE = "Europe/Rome";
const monday = DateTime.now().setZone(ZONE).plus({ weeks: 2 }).startOf("week");
const tuesdays = [1, 8, 15].map((d) => monday.plus({ days: d }).toISODate()!);

const recurrence = (start_time = "10:00", end_time = "11:00") => ({
  from: monday.toISODate(),
  until: monday.plus({ days: 20 }).toISODate(),
  weekdays: [2],
  start_time,
  end_time,
  timezone: ZONE,
});

const at = (day: string, hhmm: string) =>
  DateTime.fromISO(`${day}T${hhmm}`, { zone: ZONE }).toJSDate();

describe("recurring series", () => {
  const initializer = new dataInitializer();
  let spy: jest.SpyInstance;

  const tokenFor = (
    user: User,
    roles: string[],
    administeredProjects: number[] = [],
  ) => {
    spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: user.email, sub: user.sub },
      signature: randomSignature,
    });
    return generateToken(
      validHeader,
      {
        id: user.id,
        email: user.email,
        sub: user.sub,
        roles,
        organization: { id: user.organization_id, name: "Links" },
        administeredProjects,
      },
      randomSignature,
    );
  };

  afterEach(() => spy?.mockRestore());

  const coveringSlots = async (org: Organization) => {
    for (const day of tuesdays) {
      await slotRepo.create({
        organization_id: org.id,
        day: new Date(day),
        start: at(day, "09:00"),
        end: at(day, "12:00"),
      });
    }
  };

  // ── slots ──────────────────────────────────────────────────────────────────

  describe("slot series", () => {
    let links: Organization;
    let admin: string;

    beforeEach(async () => {
      links = await initializer.initLinksOrganization();
      admin = tokenFor(await initializer.initLinksUser(), ["admin"]);
    });

    const post = (body: object, token = admin) =>
      request(global.__APP__)
        .post("/api/slots/series")
        .set("Authorization", `Bearer ${token}`)
        .send({ organization_id: links.id, recurrence: recurrence(), ...body });

    it("previews every occurrence and writes nothing", async () => {
      const res = await post({ dry_run: true }).expect(200);
      expect(res.body.outcome).toBe("preview");
      expect(res.body.occurrences.map((o: { day: string }) => o.day)).toEqual(
        tuesdays,
      );
      expect(res.body.summary).toMatchObject({ total: 3, ok: 3, conflicts: 0 });
      expect(await Slot.count()).toBe(0);
    });

    it("creates the whole series under one series id", async () => {
      const res = await post({}).expect(201);
      expect(res.body.created).toHaveLength(3);
      const rows = await Slot.findAll();
      expect(rows).toHaveLength(3);
      expect(new Set(rows.map((r) => r.series_id))).toEqual(
        new Set([res.body.series_id]),
      );
    });

    it("refuses on a conflict, creating nothing, and says which occurrence", async () => {
      await slotRepo.create({
        organization_id: links.id,
        day: new Date(tuesdays[1]),
        start: at(tuesdays[1], "10:30"),
        end: at(tuesdays[1], "12:00"),
      });
      const res = await post({}).expect(409);
      expect(res.body.outcome).toBe("refused");
      expect(res.body.occurrences[1].problem).toMatch(
        /overlaps an existing slot/,
      );
      expect(res.body.occurrences[0].problem).toBeNull();
      expect(await Slot.count()).toBe(1);
    });

    it("creates the rest when told to skip conflicts", async () => {
      await slotRepo.create({
        organization_id: links.id,
        day: new Date(tuesdays[1]),
        start: at(tuesdays[1], "10:30"),
        end: at(tuesdays[1], "12:00"),
      });
      const res = await post({ skip_conflicts: true }).expect(201);
      expect(res.body.created).toHaveLength(2);
      expect(res.body.summary).toMatchObject({ ok: 2, conflicts: 1 });
    });

    it("is admin-only, like creating a single slot", async () => {
      const manager = tokenFor(
        await initializer.initLinksUser({ organization_manager: true }),
        ["organization-manager"],
      );
      await post({}, manager).expect(403);
    });

    it("deletes every future slot of the series", async () => {
      const { body } = await post({}).expect(201);
      const res = await request(global.__APP__)
        .delete(`/api/slots/series/${body.series_id}`)
        .set("Authorization", `Bearer ${admin}`)
        .expect(200);
      expect(res.body).toMatchObject({ deleted: 3, kept_past: 0 });
      expect(await Slot.count()).toBe(0);
    });

    it("deletes none of the series if any of its slots holds a reservation", async () => {
      const { body } = await post({}).expect(201);
      const project = await initializer.initFreeQueueProject(links, 10 ** 9);
      const user = await initializer.initLinksUser();
      await Reservation.create({
        project_id: project.id,
        made_by: user.id,
        slot_id: body.created[2],
        day: new Date(tuesdays[2]),
        start: at(tuesdays[2], "10:00"),
        end: at(tuesdays[2], "10:30"),
        description: "held",
      });
      const res = await request(global.__APP__)
        .delete(`/api/slots/series/${body.series_id}`)
        .set("Authorization", `Bearer ${admin}`)
        .expect(400);
      expect(res.body.message).toContain(tuesdays[2]);
      expect(await Slot.count()).toBe(3);
    });
  });

  // ── reservations ───────────────────────────────────────────────────────────

  describe("reservation series", () => {
    let links: Organization;
    let project: Project;
    let manager: User;
    let token: string;
    const HOUR = 3_600_000;

    const setUp = async (budget: number) => {
      links = await initializer.initLinksOrganization();
      project = await initializer.initFreeQueueProject(links, budget);
      manager = await initializer.initLinksUser({ organization_manager: true });
      token = tokenFor(manager, ["organization-manager"], [project.id]);
    };

    const post = (body: object = {}) =>
      request(global.__APP__)
        .post("/api/reservations/series")
        .set("Authorization", `Bearer ${token}`)
        .send({ project_id: project.id, recurrence: recurrence(), ...body });

    const budget = async () =>
      Number((await Project.findByPk(project.id))!.remaining_budget);

    it("places each occurrence in the slot covering it and debits the total", async () => {
      await setUp(10 * HOUR);
      await coveringSlots(links);
      const res = await post().expect(201);

      const rows = await Reservation.findAll({ order: [["start", "ASC"]] });
      const slots = await Slot.findAll({ order: [["start", "ASC"]] });
      expect(rows.map((r) => r.slot_id)).toEqual(slots.map((s) => s.id));
      expect(new Set(rows.map((r) => r.series_id))).toEqual(
        new Set([res.body.series_id]),
      );
      expect(await budget()).toBe(7 * HOUR);
      // One ledger line per reservation, summing to the debit.
      const events = await BudgetEvent.findAll({
        where: { project_id: project.id },
      });
      expect(events.map((e) => Number(e.value)).sort()).toEqual([
        -HOUR,
        -HOUR,
        -HOUR,
      ]);
    });

    it("previews the cost and the budget without touching either", async () => {
      await setUp(10 * HOUR);
      await coveringSlots(links);
      const res = await post({ dry_run: true }).expect(200);
      expect(res.body.summary).toMatchObject({
        ok: 3,
        cost_ms: 3 * HOUR,
        remaining_budget_ms: 10 * HOUR,
      });
      expect(
        res.body.occurrences.every((o: { slot_id: number }) => o.slot_id > 0),
      ).toBe(true);
      expect(await Reservation.count()).toBe(0);
      expect(await budget()).toBe(10 * HOUR);
    });

    it("reports an occurrence with no slot to go in, and creates the rest on request", async () => {
      await setUp(10 * HOUR);
      await coveringSlots(links);
      await Slot.destroy({ where: { day: tuesdays[0] } });

      const refused = await post().expect(409);
      expect(refused.body.occurrences[0].problem).toMatch(/no slot/);
      expect(await Reservation.count()).toBe(0);

      const res = await post({ skip_conflicts: true }).expect(201);
      expect(res.body.created).toHaveLength(2);
      expect(await budget()).toBe(8 * HOUR);
    });

    it("refuses a series the project cannot pay for, even when skipping conflicts", async () => {
      await setUp(2 * HOUR);
      await coveringSlots(links);
      const res = await post({ skip_conflicts: true }).expect(409);
      expect(res.body.summary.budget_problem).toMatch(/insufficient budget/);
      expect(await Reservation.count()).toBe(0);
      expect(await budget()).toBe(2 * HOUR);
    });

    it("refuses a project the caller does not administer", async () => {
      await setUp(10 * HOUR);
      token = tokenFor(manager, ["organization-manager"], []);
      await post().expect(403);
    });

    it("deletes the future series, refunding exactly what it debited", async () => {
      await setUp(10 * HOUR);
      await coveringSlots(links);
      const { body } = await post().expect(201);

      const res = await request(global.__APP__)
        .delete(`/api/reservations/series/${body.series_id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      // More than 24 h ahead, so the full cost comes back, as a single delete would.
      expect(res.body).toMatchObject({
        deleted: 3,
        refunded_ms: 3 * HOUR,
        kept_past: 0,
      });
      expect(await Reservation.count()).toBe(0);
      expect(await budget()).toBe(10 * HOUR);
      const ledger = await BudgetEvent.sum("value", {
        where: { project_id: project.id },
      });
      expect(Number(ledger)).toBe(0);
      expect(await Notification.count({ where: { user_id: manager.id } })).toBe(
        1,
      );
    });
  });
});
