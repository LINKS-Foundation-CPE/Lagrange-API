import request from "supertest";
import jwt from "jsonwebtoken";
import {
  validHeader,
  generateToken,
  randomSignature,
} from "../utils/tokenUtils.ts";
import * as mockData from "../utils/mockData";
import dataInitializer from "../utils/dataInitializer";

describe("user routes", () => {
  const initializer = new dataInitializer();

  // GET_LIST
  /* disabled to allow all organizations 
  it("should return 403 for GET if requesting user is not admin/organization-manager/project-admin", async () => {
    const links = await initializer.initLinksOrganization();
    const user = await initializer.initLinksUser();
    const userProject = await initializer.initFreeQueueProject(links, 0);

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

    const res = await request(global.__APP__)
      .get("/api/users")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);

    expect(res.body).toHaveProperty("message", `Forbidden`);

    spy.mockRestore();
  });
*/
  it("should return all user list if requesting user is admin", async () => {
    const links = await initializer.initLinksOrganization();
    const polito = await initializer.initPolitoOrganization();
    const politoUSer = await initializer.initPolitoUser();
    const linksUser = await initializer.initLinksUser();
    const linksManagerUser = await initializer.initLinksUser({
      organization_manager: true,
    });
    const userProject = await initializer.initFreeQueueProject(links, 0);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: linksManagerUser.email, sub: linksManagerUser.sub },
      signature: randomSignature,
    });

    const token = generateToken(
      validHeader,
      {
        email: linksManagerUser.email,
        sub: linksManagerUser.sub,
        roles: ["admin"],
        organization: {
          id: linksManagerUser.organization_id,
          name: "Links",
        },
      },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .get("/api/users")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    // expect 2 users from Links and 1 from Polito
    expect(res.body).toHaveLength(3);

    spy.mockRestore();
  });

  /* disabled to allow all organizations
  it("should return organization user list if requesting user is organization-manager", async () => {
    const links = await initializer.initLinksOrganization();
    const polito = await initializer.initPolitoOrganization();
    const politoUSer = await initializer.initPolitoUser();
    const linksUser = await initializer.initLinksUser();
    const linksManagerUser = await initializer.initLinksUser({
      organization_manager: true,
    });
    const userProject = await initializer.initFreeQueueProject(links, 0);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: linksManagerUser.email, sub: linksManagerUser.sub },
      signature: randomSignature,
    });

    const orgManagerToken = generateToken(
      validHeader,
      {
        email: linksManagerUser.email,
        sub: linksManagerUser.sub,
        roles: ["organization-manager"],
        organization: {
          id: linksManagerUser.organization_id,
          name: "Links",
        },
      },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .get("/api/users")
      .set("Authorization", `Bearer ${orgManagerToken}`)
      .expect(200);

    // expect just 2 users from Links and none from Polito
    expect(res.body).toHaveLength(2);

    spy.mockRestore();
  });

  it("should return organization user list if requesting user is project-admin", async () => {
    const links = await initializer.initLinksOrganization();
    const polito = await initializer.initPolitoOrganization();
    const politoUSer = await initializer.initPolitoUser();
    const linksUser = await initializer.initLinksUser();
    const projectAdminUser = await initializer.initLinksUser();
    const userProject = await initializer.initFreeQueueProject(links, 0);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: projectAdminUser.email, sub: projectAdminUser.sub },
      signature: randomSignature,
    });

    const orgManagerToken = generateToken(
      validHeader,
      {
        email: projectAdminUser.email,
        sub: projectAdminUser.sub,
        roles: ["project-admin"],
        organization: {
          id: projectAdminUser.organization_id,
          name: "Links",
        },
      },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .get("/api/users")
      .set("Authorization", `Bearer ${orgManagerToken}`)
      .expect(200);

    // expect just 2 users from Links and none from Polito
    expect(res.body).toHaveLength(2);

    spy.mockRestore();
  });

  it("should return 403 if requesting user is normal user", async () => {
    const links = await initializer.initLinksOrganization();
    const polito = await initializer.initPolitoOrganization();
    const politoUSer = await initializer.initPolitoUser();
    const linksUser = await initializer.initLinksUser();
    const linksManagerUser = await initializer.initLinksUser({
      organization_manager: true,
    });
    const userProject = await initializer.initFreeQueueProject(links, 0);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: linksManagerUser.email, sub: linksManagerUser.sub },
      signature: randomSignature,
    });

    const orgManagerToken = generateToken(
      validHeader,
      {
        email: linksManagerUser.email,
        sub: linksManagerUser.sub,
        roles: ["user"],
        organization: {
          id: linksManagerUser.organization_id,
          name: "Links",
        },
      },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .get("/api/users")
      .set("Authorization", `Bearer ${orgManagerToken}`)
      .expect(403);

    expect(res.body).toHaveProperty("message", `Forbidden`);

    spy.mockRestore();
  });
 */
  // GET_ONE

  it("should return any user if requested by id and requesting user is project-admin", async () => {
    const links = await initializer.initLinksOrganization();
    const polito = await initializer.initPolitoOrganization();
    const politoUSer = await initializer.initPolitoUser();
    const linksUser = await initializer.initLinksUser();
    const linksManagerUser = await initializer.initLinksUser({
      organization_manager: true,
    });
    const userProject = await initializer.initFreeQueueProject(links, 0);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: linksManagerUser.email, sub: linksManagerUser.sub },
      signature: randomSignature,
    });

    const orgManagerToken = generateToken(
      validHeader,
      {
        email: linksManagerUser.email,
        sub: linksManagerUser.sub,
        roles: ["project-admin"],
        organization: {
          id: linksManagerUser.organization_id,
          name: "Links",
        },
      },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .get(`/api/users/${politoUSer.id}`)
      .set("Authorization", `Bearer ${orgManagerToken}`)
      .expect(200);

    expect(res.body).toHaveProperty("email", politoUSer.email);

    spy.mockRestore();
  });

  // CREATE

  it("ignores pulla_user from an organization manager, on update and on create", async () => {
    // Pulse access is a platform-admin grant. The dashboard hides the control
    // from managers, but the backend is what has to enforce it — and since
    // /jobAuthorizer decides pulse access from this flag, whoever can set it
    // can grant machine capability.
    const links = await initializer.initLinksOrganization();
    const target = await initializer.initLinksUser();
    const manager = await initializer.initLinksUser({
      organization_manager: true,
    });

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: manager.email, sub: manager.sub },
      signature: randomSignature,
    });
    const managerToken = generateToken(
      validHeader,
      {
        email: manager.email,
        sub: manager.sub,
        roles: ["organization-manager"],
        organization: { id: links.id, name: "Links" },
      },
      randomSignature,
    );

    // The update goes through — it is a legitimate edit — but the flag does not.
    await request(global.__APP__)
      .put(`/api/users/${target.id}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ organization_id: links.id, pulla_user: true })
      .expect(200);

    await target.reload();
    expect(target.pulla_user).toBeFalsy();

    const created = await request(global.__APP__)
      .post("/api/users")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        email: "pulse-attempt@linksfoundatin.com",
        organization_id: links.id,
        pulla_user: true,
      })
      .expect(201);

    expect(created.body.pulla_user).toBeFalsy();
    spy.mockRestore();
  });

  it("lets a platform admin set pulla_user", async () => {
    const links = await initializer.initLinksOrganization();
    const target = await initializer.initLinksUser();
    const admin = await initializer.initLinksUser();

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: admin.email, sub: admin.sub },
      signature: randomSignature,
    });
    const adminToken = generateToken(
      validHeader,
      { email: admin.email, sub: admin.sub, roles: ["admin"] },
      randomSignature,
    );

    await request(global.__APP__)
      .put(`/api/users/${target.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ pulla_user: true })
      .expect(200);

    await target.reload();
    expect(target.pulla_user).toBe(true);
    spy.mockRestore();
  });

  it("should return new user after creation", async () => {
    const links = await initializer.initLinksOrganization();
    const polito = await initializer.initPolitoOrganization();
    const politoUSer = await initializer.initPolitoUser();
    const linksUser = await initializer.initLinksUser();
    const linksManagerUser = await initializer.initLinksUser({
      organization_manager: true,
    });
    const userProject = await initializer.initFreeQueueProject(links, 0);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: linksManagerUser.email, sub: linksManagerUser.sub },
      signature: randomSignature,
    });

    const orgManagerToken = generateToken(
      validHeader,
      {
        email: linksManagerUser.email,
        sub: linksManagerUser.sub,
        roles: ["organization-manager"],
        organization: {
          id: linksManagerUser.organization_id,
          name: "Links",
        },
      },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .post(`/api/users`)
      .set("Authorization", `Bearer ${orgManagerToken}`)
      .send({
        email: "testuser@links.com",
        organization_id: linksManagerUser.organization_id,
        default_project_id: userProject.id,
        organization_manager: true,
      })
      .expect(201);

    expect(res.body).toHaveProperty("email", "testuser@links.com");
    expect(res.body).toHaveProperty(
      "organization_id",
      linksManagerUser.organization_id,
    );
    expect(res.body).toHaveProperty("default_project_id", userProject.id);
    expect(res.body).toHaveProperty("organization_auditor", false);
    expect(res.body).toHaveProperty("organization_manager", true);

    spy.mockRestore();
  });

  it("should return 403 for user creation if not org-manager", async () => {
    const links = await initializer.initLinksOrganization();
    const polito = await initializer.initPolitoOrganization();
    const politoUSer = await initializer.initPolitoUser();
    const linksUser = await initializer.initLinksUser();
    // const linksManagerUser = await initializer.initLinksUser({
    //   organization_manager: true,
    // });
    const userProject = await initializer.initFreeQueueProject(links, 0);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: linksUser.email, sub: linksUser.sub },
      signature: randomSignature,
    });

    const token = generateToken(
      validHeader,
      {
        email: linksUser.email,
        sub: linksUser.sub,
        roles: ["project-admin"],
        organization: {
          id: linksUser.organization_id,
          name: "Links",
        },
      },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .post(`/api/users`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        email: "testuser@links.com",
        organization_id: linksUser.organization_id,
        default_project_id: userProject.id,
        organization_manager: true,
      })
      .expect(403);

    expect(res.body).toHaveProperty("message", "Forbidden");

    spy.mockRestore();
  });

  it("should return 403 for user creation in another organization", async () => {
    const links = await initializer.initLinksOrganization();
    const polito = await initializer.initPolitoOrganization();
    const politoUSer = await initializer.initPolitoUser();
    const linksUser = await initializer.initLinksUser();
    const linksManagerUser = await initializer.initLinksUser({
      organization_manager: true,
    });
    const userProject = await initializer.initFreeQueueProject(links, 0);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: linksManagerUser.email, sub: linksManagerUser.sub },
      signature: randomSignature,
    });

    const orgManagerToken = generateToken(
      validHeader,
      {
        email: linksManagerUser.email,
        sub: linksManagerUser.sub,
        roles: ["organization-manager"],
        organization: {
          id: linksManagerUser.organization_id,
          name: "Links",
        },
      },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .post(`/api/users`)
      .set("Authorization", `Bearer ${orgManagerToken}`)
      .send({
        email: "testuser@links.com",
        organization_id: politoUSer.organization_id,
        default_project_id: userProject.id,
        organization_manager: true,
      })
      .expect(403);

    expect(res.body).toHaveProperty(
      "message",
      "Cannot add user to another organization",
    );

    spy.mockRestore();
  });

  it("an admin should be able to add users to any organization", async () => {
    const links = await initializer.initLinksOrganization();
    const polito = await initializer.initPolitoOrganization();
    const politoUSer = await initializer.initPolitoUser();
    const linksUser = await initializer.initLinksUser();
    const linksManagerUser = await initializer.initLinksUser({
      organization_manager: true,
    });
    const userProject = await initializer.initFreeQueueProject(links, 0);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: linksManagerUser.email, sub: linksManagerUser.sub },
      signature: randomSignature,
    });

    const orgManagerToken = generateToken(
      validHeader,
      {
        email: linksManagerUser.email,
        sub: linksManagerUser.sub,
        roles: ["admin"],
        organization: {
          id: linksManagerUser.organization_id,
          name: "Links",
        },
      },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .post(`/api/users`)
      .set("Authorization", `Bearer ${orgManagerToken}`)
      .send({
        email: "testuser@links.com",
        organization_id: politoUSer.organization_id,
        default_project_id: userProject.id,
        organization_manager: true,
      })
      .expect(201);

    spy.mockRestore();
  });

  // UPDATE

  it("should return updated user after update", async () => {
    const links = await initializer.initLinksOrganization();
    const polito = await initializer.initPolitoOrganization();
    const politoUSer = await initializer.initPolitoUser();
    const linksUser = await initializer.initLinksUser();
    const linksManagerUser = await initializer.initLinksUser({
      organization_manager: true,
    });
    const userProject = await initializer.initFreeQueueProject(links, 0);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: linksManagerUser.email, sub: linksManagerUser.sub },
      signature: randomSignature,
    });

    const orgManagerToken = generateToken(
      validHeader,
      {
        email: linksManagerUser.email,
        sub: linksManagerUser.sub,
        roles: ["organization-manager"],
        organization: {
          id: linksManagerUser.organization_id,
          name: "Links",
        },
      },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .put(`/api/users/${linksUser.id}`)
      .set("Authorization", `Bearer ${orgManagerToken}`)
      .send({
        email: "testuser@links.com",
        organization_id: linksManagerUser.organization_id,
        // default_project_id: userProject.id,
        organization_auditor: true,
      })
      .expect(200);

    //console.log(res.body)

    expect(res.body).toHaveProperty("email", "testuser@links.com");
    expect(res.body).toHaveProperty(
      "organization_id",
      linksManagerUser.organization_id,
    );
    //expect(res.body).toHaveProperty("default_project_id", userProject.id);
    expect(res.body).toHaveProperty("organization_auditor", true);
    expect(res.body).toHaveProperty("organization_manager", false);

    spy.mockRestore();
  });

  it("should return 403 for user update if not org-manager", async () => {
    const links = await initializer.initLinksOrganization();
    const polito = await initializer.initPolitoOrganization();
    const politoUSer = await initializer.initPolitoUser();
    const linksUser = await initializer.initLinksUser();
    // const linksManagerUser = await initializer.initLinksUser({
    //   organization_manager: true,
    // });
    const userProject = await initializer.initFreeQueueProject(links, 0);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: linksUser.email, sub: linksUser.sub },
      signature: randomSignature,
    });

    const token = generateToken(
      validHeader,
      {
        email: linksUser.email,
        sub: linksUser.sub,
        roles: ["project-admin"],
        organization: {
          id: linksUser.organization_id,
          name: "Links",
        },
      },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .put(`/api/users/${politoUSer.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        email: "testuser@links.com",
        organization_id: linksUser.organization_id,
        default_project_id: userProject.id,
        organization_manager: true,
      })
      .expect(403);

    expect(res.body).toHaveProperty("message", "Forbidden");

    spy.mockRestore();
  });

  it("should return 403 for user update into another organization", async () => {
    const links = await initializer.initLinksOrganization();
    const polito = await initializer.initPolitoOrganization();
    const politoUSer = await initializer.initPolitoUser();
    const linksUser = await initializer.initLinksUser();
    const linksManagerUser = await initializer.initLinksUser({
      organization_manager: true,
    });
    const userProject = await initializer.initFreeQueueProject(links, 0);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: linksManagerUser.email, sub: linksManagerUser.sub },
      signature: randomSignature,
    });

    const orgManagerToken = generateToken(
      validHeader,
      {
        email: linksManagerUser.email,
        sub: linksManagerUser.sub,
        roles: ["organization-manager"],
        organization: {
          id: linksManagerUser.organization_id,
          name: "Links",
        },
      },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .put(`/api/users/${linksUser.id}`)
      .set("Authorization", `Bearer ${orgManagerToken}`)
      .send({
        email: "testuser@links.com",
        organization_id: politoUSer.organization_id,
        default_project_id: userProject.id,
        organization_manager: true,
      })
      .expect(403);

    expect(res.body).toHaveProperty(
      "message",
      "Cannot update user from another organization",
    );

    spy.mockRestore();
  });

  it("an admin should be able to update users into any organization", async () => {
    const links = await initializer.initLinksOrganization();
    const polito = await initializer.initPolitoOrganization();
    const politoUSer = await initializer.initPolitoUser();
    const linksUser = await initializer.initLinksUser();
    const linksManagerUser = await initializer.initLinksUser({
      organization_manager: true,
    });
    const userProject = await initializer.initFreeQueueProject(links, 0);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: linksManagerUser.email, sub: linksManagerUser.sub },
      signature: randomSignature,
    });

    const orgManagerToken = generateToken(
      validHeader,
      {
        email: linksManagerUser.email,
        sub: linksManagerUser.sub,
        roles: ["admin"],
        organization: {
          id: linksManagerUser.organization_id,
          name: "Links",
        },
      },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .put(`/api/users/${linksUser.id}`)
      .set("Authorization", `Bearer ${orgManagerToken}`)
      .send({
        email: "testuser@links.com",
        organization_id: politoUSer.organization_id,
        //default_project_id: userProject.id,
        organization_manager: true,
      })
      .expect(200);

    expect(res.body).toHaveProperty(
      "organization_id",
      politoUSer.organization_id,
    );

    spy.mockRestore();
  });

  // A platform admin has no organization of its own, so a partial update (the
  // shape a script uses to flip one flag, e.g. Pulse access) must not try to
  // read one — and must leave the target's organization untouched.
  it("should let an admin with no organization patch a single field", async () => {
    const links = await initializer.initLinksOrganization();
    const linksUser = await initializer.initLinksUser();

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: "admin@test", sub: "admin-sub" },
      signature: randomSignature,
    });

    const adminToken = generateToken(
      validHeader,
      { email: "admin@test", sub: "admin-sub", roles: ["admin"] },
      randomSignature,
    );

    const res = await request(global.__APP__)
      .put(`/api/users/${linksUser.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ pulla_user: true })
      .expect(200);

    expect(res.body).toHaveProperty("pulla_user", true);
    expect(res.body).toHaveProperty("organization_id", links.id);

    spy.mockRestore();
  });

  // TODO: add checks for default project changes
});
