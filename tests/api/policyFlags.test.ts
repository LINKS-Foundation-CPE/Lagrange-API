import request from "supertest";
import jwt from "jsonwebtoken";
import {
  validHeader,
  generateToken,
  randomSignature,
} from "../utils/tokenUtils.ts";
import dataInitializer from "../utils/dataInitializer.ts";
import * as reservationRepo from "../../src/repositories/reservation.repository.ts";
import { DateTime } from "luxon";

/**
 * Deployment policy flags (src/config/policy.ts):
 *   SLOT_CONSTRAINED_RESERVATIONS   — reservations must live inside a slot
 *   ALLOW_FOREIGN_ORG_QUEUE_IN_SLOTS — open queue during foreign-org slots
 * Flags are read from process.env on every access, so each test sets and
 * clears them explicitly.
 */

const FLAGS = [
  "SLOT_CONSTRAINED_RESERVATIONS",
  "ALLOW_FOREIGN_ORG_QUEUE_IN_SLOTS",
];

afterEach(() => {
  for (const f of FLAGS) delete process.env[f];
});

const keycloakTokenFor = (user: { email: string; sub: string }) => {
  const spy = jest.spyOn(jwt, "decode").mockReturnValue({
    header: validHeader,
    payload: { email: user.email, sub: user.sub },
    signature: randomSignature,
  });
  const token = generateToken(
    validHeader,
    { email: user.email, sub: user.sub },
    randomSignature,
  );
  return { token, spy };
};

describe("ALLOW_FOREIGN_ORG_QUEUE_IN_SLOTS (jobAuthorizer)", () => {
  const initializer = new dataInitializer();

  const setupForeignSlot = async () => {
    const links = await initializer.initLinksOrganization();
    const polito = await initializer.initPolitoOrganization();
    const politoUser = await initializer.initPolitoUser();
    const politoProject = await initializer.initFreeQueueProject(polito);
    await initializer.addUserToProject(politoUser, politoProject);
    await initializer.addDefaultProjectToUser(politoUser, politoProject);
    // active slot owned by LINKS while a Polito user submits
    await initializer.assignCurrentSlot(links, 1, 1);
    return { links, polito, politoUser, politoProject };
  };

  it("default: foreign-org user is admitted to the queue during another org's slot", async () => {
    const { politoUser } = await setupForeignSlot();
    const { token, spy } = keycloakTokenFor(politoUser);

    await request(global.__APP__)
      .post("/jobAuthorizer")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    spy.mockRestore();
  });

  it("flag=false: foreign-org user is rejected during another org's slot", async () => {
    process.env.ALLOW_FOREIGN_ORG_QUEUE_IN_SLOTS = "false";
    const { politoUser } = await setupForeignSlot();
    const { token, spy } = keycloakTokenFor(politoUser);

    const res = await request(global.__APP__)
      .post("/jobAuthorizer")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);
    expect(res.body).toHaveProperty(
      "message",
      "Slot reserved to another organization",
    );

    spy.mockRestore();
  });

  it("flag=false: slot-org user is still admitted", async () => {
    process.env.ALLOW_FOREIGN_ORG_QUEUE_IN_SLOTS = "false";
    const links = await initializer.initLinksOrganization();
    const linksUser = await initializer.initLinksUser();
    const linksProject = await initializer.initFreeQueueProject(links);
    await initializer.addUserToProject(linksUser, linksProject);
    await initializer.addDefaultProjectToUser(linksUser, linksProject);
    await initializer.assignCurrentSlot(links, 1, 1);

    const { token, spy } = keycloakTokenFor(linksUser);
    await request(global.__APP__)
      .post("/jobAuthorizer")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    spy.mockRestore();
  });

  it("flag=false: user of an organization referencing the slot org is admitted", async () => {
    process.env.ALLOW_FOREIGN_ORG_QUEUE_IN_SLOTS = "false";
    const links = await initializer.initLinksOrganization();
    const polito = await initializer.initPolitoOrganization();
    polito.reference_organization_id = links.id;
    await polito.save();

    const politoUser = await initializer.initPolitoUser();
    const politoProject = await initializer.initFreeQueueProject(polito);
    await initializer.addUserToProject(politoUser, politoProject);
    await initializer.addDefaultProjectToUser(politoUser, politoProject);
    await initializer.assignCurrentSlot(links, 1, 1);

    const { token, spy } = keycloakTokenFor(politoUser);
    await request(global.__APP__)
      .post("/jobAuthorizer")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    spy.mockRestore();
  });
});

describe("SLOT_CONSTRAINED_RESERVATIONS (reservation creation)", () => {
  const initializer = new dataInitializer();

  const setupProjectAdmin = async () => {
    const links = await initializer.initLinksOrganization();
    const manager = await initializer.initLinksUser({
      organization_manager: true,
    });
    const project = await initializer.initFreeQueueProject(links, 1000000000);
    const { spy } = keycloakTokenFor(manager);
    const token = generateToken(
      validHeader,
      {
        id: manager.id,
        email: manager.email,
        sub: manager.sub,
        roles: ["organization-manager"],
        organization: { id: manager.organization_id, name: "Links" },
        administeredProjects: [project.id],
      },
      randomSignature,
    );
    return { links, manager, project, token, spy };
  };

  const window = () => {
    const now = DateTime.utc().startOf("hour");
    return {
      start: now.plus({ hours: 1 }).toISO({ includeOffset: true }),
      end: now.plus({ hours: 2 }).toISO({ includeOffset: true }),
    };
  };

  it("default: reservation without slot_id is rejected", async () => {
    const { project, token, spy } = await setupProjectAdmin();

    const res = await request(global.__APP__)
      .post("/api/reservations")
      .set("Authorization", `Bearer ${token}`)
      .send({ project_id: project.id, ...window() })
      .expect(400);
    expect(res.body.message).toMatch(/slot_id is required/);

    spy.mockRestore();
  });

  it("flag=false: reservation without slot_id is created and budget debited", async () => {
    process.env.SLOT_CONSTRAINED_RESERVATIONS = "false";
    const { project, token, spy } = await setupProjectAdmin();
    const before = Number(project.remaining_budget);

    const res = await request(global.__APP__)
      .post("/api/reservations")
      .set("Authorization", `Bearer ${token}`)
      .send({ project_id: project.id, ...window() })
      .expect(201);

    expect(res.body.slot_id).toBeNull();
    expect(res.body.project_id).toBe(project.id);

    await project.reload();
    expect(Number(project.remaining_budget)).toBe(before - 3600 * 1000);

    spy.mockRestore();
  });

  it("flag=false: an active slotless reservation is enforced by the authorizer", async () => {
    process.env.SLOT_CONSTRAINED_RESERVATIONS = "false";
    const links = await initializer.initLinksOrganization();
    const manager = await initializer.initLinksUser({
      organization_manager: true,
    });
    const reservingProject = await initializer.initFreeQueueProject(
      links,
      1000000000,
    );

    // Create the ACTIVE slotless reservation directly (the API only accepts
    // future windows; an active one can only exist once time has passed).
    const now = DateTime.utc();
    await reservationRepo.create({
      project_id: reservingProject.id,
      slot_id: null,
      day: now.toISODate(),
      start: now.minus({ minutes: 10 }).toJSDate(),
      end: now.plus({ minutes: 50 }).toJSDate(),
      made_by: manager.id,
      description: "active slotless reservation",
    });

    // a different user/project must now be rejected, even without any slot
    const outsider = await initializer.initLinksUser();
    const outsiderProject = await initializer.initFreeQueueProject(links);
    await initializer.addUserToProject(outsider, outsiderProject);
    await initializer.addDefaultProjectToUser(outsider, outsiderProject);

    const { token, spy } = keycloakTokenFor(outsider);
    const res = await request(global.__APP__)
      .post("/jobAuthorizer")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);
    expect(res.body).toHaveProperty(
      "message",
      "Slot reserved to another project",
    );
    spy.mockRestore();
  });
});

describe("OpenAPI documentation", () => {
  it("serves the swagger UI at /api-docs", async () => {
    await request(global.__APP__).get("/api-docs/").expect(200);
  });
});
