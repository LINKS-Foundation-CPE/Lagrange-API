import request from "supertest";
import dataInitializer from "../utils/dataInitializer.ts";
import { BudgetEvent, Project } from "../../src/models/index.ts";
import { generateToken, validHeader } from "../utils/tokenUtils.ts";

/** POST /api/organizations/:id/vault/refill — budget in, with its ledger entry. */
describe("vault refill", () => {
  const initializer = new dataInitializer();
  const HOUR = 3_600_000;

  const token = (roles: string[], id = 1, email = "admin@test") =>
    generateToken(validHeader, {
      id,
      sub: `sub-${id}`,
      email,
      roles,
      administeredProjects: [],
    });

  const refill = (
    orgId: number,
    body: object,
    roles = ["admin"],
    id?: number,
  ) =>
    request(global.__APP__)
      .post(`/api/organizations/${orgId}/vault/refill`)
      .set("Authorization", `Bearer ${token(roles, id)}`)
      .send(body);

  let org: Awaited<ReturnType<typeof initializer.initOrganization>>;
  let adminId: number;

  beforeEach(async () => {
    const suffix = Math.floor(Math.random() * 1_000_000);
    org = await initializer.initOrganization(`RefillOrg-${suffix}`);
    const admin = await initializer.initUser({
      email: `refill-admin-${suffix}@example.com`,
      sub: `refill-admin-${suffix}`,
      organization_id: org.id,
    });
    adminId = admin.id;
  });

  const vaultBudget = async () =>
    Number((await Project.findByPk(org.vault_project_id))!.remaining_budget);

  it("adds the amount to the vault and records it in the ledger", async () => {
    const before = await vaultBudget();
    const res = await refill(
      org.id,
      { amount: 10 * HOUR, note: "order 2026/118" },
      ["admin"],
      adminId,
    ).expect(201);

    expect(await vaultBudget()).toBe(before + 10 * HOUR);
    expect(res.body).toMatchObject({
      organization_id: org.id,
      vault_project_id: org.vault_project_id,
      amount: 10 * HOUR,
      remaining_budget: before + 10 * HOUR,
    });
    const event = await BudgetEvent.findByPk(res.body.budget_event_id);
    expect(Number(event!.value)).toBe(10 * HOUR);
    expect(event!.project_id).toBe(org.vault_project_id);
    expect(event!.billing).toBe(false);
    expect(event!.user_id).toBe(adminId);
    expect(event!.description).toContain("vault refill");
    expect(event!.description).toContain("(10 h)");
    expect(event!.description).toContain("order 2026/118");
  });

  it("keeps balance and ledger in step over several refills", async () => {
    const before = await vaultBudget();
    await refill(org.id, { amount: HOUR }, ["admin"], adminId).expect(201);
    await refill(org.id, { amount: 2 * HOUR }, ["admin"], adminId).expect(201);
    expect(await vaultBudget()).toBe(before + 3 * HOUR);
    const events = await BudgetEvent.findAll({
      where: { project_id: org.vault_project_id },
    });
    const refills = events.filter((e) =>
      e.description.startsWith("vault refill"),
    );
    expect(refills.reduce((s, e) => s + Number(e.value), 0)).toBe(3 * HOUR);
  });

  it("is for platform admins only", async () => {
    await refill(org.id, { amount: HOUR }, ["organization-manager"]).expect(
      403,
    );
    await refill(org.id, { amount: HOUR }, ["readOnlyAdmin"]).expect(403);
  });

  it("refuses an amount that is not a positive whole number of ms", async () => {
    await refill(org.id, { amount: 0 }).expect(400);
    await refill(org.id, { amount: -HOUR }).expect(400);
    await refill(org.id, { amount: 1.5 }).expect(400);
    await refill(org.id, {}).expect(400);
  });

  it("answers 404 for an unknown organization", async () => {
    await refill(999_999, { amount: HOUR }).expect(404);
  });
});
