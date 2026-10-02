import request from "supertest";
import dataInitializer from "../utils/dataInitializer.ts";
import * as userRepo from "../../src/repositories/user.repository.ts";
import { SystemConfig } from "../../src/models/systemConfig.ts";
import {
  _setUsernameFormatForTests,
  freezeUsernameFormat,
  usernameFormat,
} from "../../src/config/usernamePolicy.ts";
import { hasPulseAccessOidcRole } from "../../src/services/user.service.ts";

/**
 * USERNAME_FORMAT deployment flag (src/config/usernamePolicy.ts):
 * 'email' (default, historical) vs 'any' (HPC cluster account names).
 * Frozen in system_configs at first boot; conflicting redeploys must fail.
 */

afterEach(async () => {
  delete process.env.USERNAME_FORMAT;
  delete process.env.PULSE_ACCESS_OIDC_ROLE;
  _setUsernameFormatForTests(null);
  await SystemConfig.destroy({ where: { key: "username_format" } });
});

describe("identity validation switches on USERNAME_FORMAT", () => {
  const initializer = new dataInitializer();

  it("rejects a non-email username on /jobReport under format=email (default)", async () => {
    const res = await request(global.__APP__)
      .post("/jobReport")
      .send({
        username: "hpcuser01",
        jobid: "uuid-fmt-1",
        submitted_datetime: new Date(),
      })
      .expect(400);
    expect(JSON.stringify(res.body)).toContain("email");
  });

  it("accepts a cluster username end-to-end under format=any", async () => {
    _setUsernameFormatForTests("any");

    const polito = await initializer.initPolitoOrganization();
    const user = await userRepo.create({
      email: "hpcuser01",
      organization_id: polito.id,
    });
    const project = await initializer.initNoFreeQueueProject(polito);
    await initializer.addUserToProject(user, project);

    await request(global.__APP__)
      .post("/jobReport")
      .send({
        project_name: project.name,
        username: "hpcuser01",
        jobid: "uuid-fmt-2",
        submitted_datetime: new Date(),
      })
      .expect(200);
  });

  it("still rejects whitespace usernames under format=any", async () => {
    _setUsernameFormatForTests("any");
    await request(global.__APP__)
      .post("/jobReport")
      .send({
        username: "not a username",
        jobid: "uuid-fmt-3",
        submitted_datetime: new Date(),
      })
      .expect(400);
  });
});

describe("freeze-at-first-deployment semantics", () => {
  it("first boot freezes the env value; unset env freezes the default", async () => {
    expect(await freezeUsernameFormat()).toBe("email");
    const stored = await SystemConfig.findByPk("username_format");
    expect(stored?.value).toBe("email");
  });

  it("first boot with USERNAME_FORMAT=any freezes 'any'", async () => {
    process.env.USERNAME_FORMAT = "any";
    expect(await freezeUsernameFormat()).toBe("any");
    expect(usernameFormat()).toBe("any");
  });

  it("a later boot with a conflicting value refuses to start", async () => {
    process.env.USERNAME_FORMAT = "any";
    await freezeUsernameFormat();
    _setUsernameFormatForTests(null);

    process.env.USERNAME_FORMAT = "email";
    await expect(freezeUsernameFormat()).rejects.toThrow(/frozen at first/);
  });

  it("a later boot with the env var unset adopts the frozen value", async () => {
    process.env.USERNAME_FORMAT = "any";
    await freezeUsernameFormat();
    _setUsernameFormatForTests(null);

    delete process.env.USERNAME_FORMAT;
    expect(await freezeUsernameFormat()).toBe("any");
    expect(usernameFormat()).toBe("any");
  });

  it("rejects an invalid USERNAME_FORMAT value outright", async () => {
    process.env.USERNAME_FORMAT = "banana";
    await expect(freezeUsernameFormat()).rejects.toThrow(
      /Invalid USERNAME_FORMAT/,
    );
  });
});

describe("/userRoles machine endpoint", () => {
  const initializer = new dataInitializer();

  it("404s for an unknown identity", async () => {
    await request(global.__APP__)
      .get("/userRoles/nobody@nowhere.org")
      .expect(404);
  });

  it("adds pulla_user for a user with Pulse access", async () => {
    const polito = await initializer.initPolitoOrganization();
    const plain = await userRepo.create({
      email: "roles-plain@example.com",
      organization_id: polito.id,
    });
    const sweeper = await userRepo.create({
      email: "roles-sweeper@example.com",
      organization_id: polito.id,
      pulla_user: true,
    });

    const r1 = await request(global.__APP__)
      .get(`/userRoles/${plain.email}`)
      .expect(200);
    expect(r1.body.roles).toEqual(["cortex_user"]);

    const r2 = await request(global.__APP__)
      .get(`/userRoles/${encodeURIComponent(sweeper.email)}`)
      .expect(200);
    expect(r2.body.roles).toEqual(["cortex_user", "pulla_user"]);
  });

  it("withholds pulla_user for a user without Pulse access", async () => {
    const polito = await initializer.initPolitoOrganization();
    const plain = await userRepo.create({
      email: "roles-plain-off@example.com",
      organization_id: polito.id,
    });

    const r = await request(global.__APP__)
      .get(`/userRoles/${encodeURIComponent(plain.email)}`)
      .expect(200);
    expect(r.body.roles).toEqual(["cortex_user"]);
  });
});

describe("Pulse access seeded from identity-provider roles", () => {
  const initializer = new dataInitializer();

  it("reads the realm role a new registration is seeded from", async () => {
    const polito = await initializer.initPolitoOrganization();
    expect(hasPulseAccessOidcRole(["cortex_user", "pulla_user"])).toBe(true);

    const user = await userRepo.create({
      email: "pulse-grant@example.com",
      organization_id: polito.id,
      pulla_user: hasPulseAccessOidcRole(["cortex_user", "pulla_user"]),
    });

    const r = await request(global.__APP__)
      .get(`/userRoles/${encodeURIComponent(user.email)}`)
      .expect(200);
    expect(r.body.roles).toEqual(["cortex_user", "pulla_user"]);
  });

  it("honours a deployment-specific role name", () => {
    process.env.PULSE_ACCESS_OIDC_ROLE = "sweep-users";

    expect(hasPulseAccessOidcRole(["pulla_user"])).toBe(false);
    expect(hasPulseAccessOidcRole(["sweep-users"])).toBe(true);
  });

  it("leaves an identity without the role without access", () => {
    expect(hasPulseAccessOidcRole([])).toBe(false);
    expect(hasPulseAccessOidcRole(["cortex_user"])).toBe(false);
  });

  // The regression this replaces: the realm role used to be mirrored onto the
  // row at every login, so an admin's revocation came back on the user's next
  // sign-in. Reading the claim must not write anything.
  it("does not restore access an admin revoked", async () => {
    const polito = await initializer.initPolitoOrganization();
    const user = await userRepo.create({
      email: "pulse-revoked@example.com",
      organization_id: polito.id,
      pulla_user: false,
    });

    expect(hasPulseAccessOidcRole(["cortex_user", "pulla_user"])).toBe(true);

    const reloaded = await userRepo.getOne(user.id);
    expect(reloaded?.pulla_user).toBe(false);
    const r = await request(global.__APP__)
      .get(`/userRoles/${encodeURIComponent(user.email)}`)
      .expect(200);
    expect(r.body.roles).toEqual(["cortex_user"]);
  });
});
