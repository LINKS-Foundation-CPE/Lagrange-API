import request from "supertest";

/**
 * Public GET /config exposes client-safe deployment flags (no auth).
 * policy.ts reads env at access time, so toggling the env var per-case works.
 */

afterEach(() => {
  delete process.env.SLOT_CONSTRAINED_RESERVATIONS;
});

describe("GET /config (public client flags)", () => {
  it("returns slotConstrainedReservations, defaulting to true, without auth", async () => {
    const res = await request(global.__APP__).get("/config").expect(200);
    expect(res.body).toHaveProperty("slotConstrainedReservations", true);
  });

  it("reflects SLOT_CONSTRAINED_RESERVATIONS=false (slot-less enabled)", async () => {
    process.env.SLOT_CONSTRAINED_RESERVATIONS = "false";
    const res = await request(global.__APP__).get("/config").expect(200);
    expect(res.body.slotConstrainedReservations).toBe(false);
  });
});
