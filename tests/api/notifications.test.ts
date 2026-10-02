import request from "supertest";
import dataInitializer from "../utils/dataInitializer.ts";
import { Notification } from "../../src/models/index.ts";
import { generateToken, validHeader } from "../utils/tokenUtils.ts";

/**
 * Notifications are personal.
 *
 * `restrictToUser` exempts platform admins so the "All Jobs" view can show
 * every user's jobs. That exemption must not reach notifications: every login
 * writes one, so an admin's list would fill with other people's, and "mark all
 * as read" would then 403 on the first row it does not own.
 */

const tokenFor = (id: number, roles: string[]) =>
  generateToken(validHeader, {
    id,
    sub: `sub-${id}`,
    email: `user${id}@example.com`,
    roles,
    organization: undefined,
    administeredProjects: [],
  });

describe("GET /api/notifications", () => {
  const initializer = new dataInitializer();

  const seed = async () => {
    const suffix = Math.floor(Math.random() * 1_000_000);
    const org = await initializer.initOrganization(`NotifOrg-${suffix}`);
    const mine = await initializer.initUser({
      email: `mine-${suffix}@example.com`,
      sub: `mine-${suffix}`,
      organization_id: org.id,
    });
    const theirs = await initializer.initUser({
      email: `theirs-${suffix}@example.com`,
      sub: `theirs-${suffix}`,
      organization_id: org.id,
    });
    const ours = await Notification.create({
      user_id: mine.id,
      read: false,
      title: "login",
      description: "mine",
    });
    const others = await Notification.create({
      user_id: theirs.id,
      read: false,
      title: "login",
      description: "theirs",
    });
    return { mine, theirs, ours, others };
  };

  it("lists only the caller's notifications, admin included", async () => {
    const { mine, others } = await seed();
    const res = await request(global.__APP__)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${tokenFor(mine.id, ["admin"])}`)
      .expect(200);

    const ids = res.body.map((n: { id: number }) => n.id);
    expect(ids).not.toContain(others.id);
    expect(
      res.body.every((n: { user_id: number }) => n.user_id === mine.id),
    ).toBe(true);
  });

  it("ignores a user_id filter that would widen the list", async () => {
    const { mine, theirs, others } = await seed();
    const res = await request(global.__APP__)
      .get("/api/notifications")
      .query({ filter: JSON.stringify({ user_id: theirs.id }) })
      .set("Authorization", `Bearer ${tokenFor(mine.id, ["admin"])}`)
      .expect(200);

    expect(res.body.map((n: { id: number }) => n.id)).not.toContain(others.id);
  });

  it("refuses to mark someone else's notification as read", async () => {
    const { mine, others } = await seed();
    await request(global.__APP__)
      .patch(`/api/notifications/${others.id}/read`)
      .set("Authorization", `Bearer ${tokenFor(mine.id, ["admin"])}`)
      .expect(403);
  });

  it("marks the caller's own notification as read", async () => {
    const { mine, ours } = await seed();
    await request(global.__APP__)
      .patch(`/api/notifications/${ours.id}/read`)
      .set("Authorization", `Bearer ${tokenFor(mine.id, [])}`)
      .expect(200);

    const after = await Notification.findByPk(ours.id);
    expect(after!.read).toBe(true);
  });
});
