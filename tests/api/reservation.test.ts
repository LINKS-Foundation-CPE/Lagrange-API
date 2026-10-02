import request from "supertest";
import jwt from "jsonwebtoken";
import {
  validHeader,
  generateToken,
  randomSignature,
} from "../utils/tokenUtils.ts";
import * as mockData from "../utils/mockData.ts";
import dataInitializer from "../utils/dataInitializer.ts";
import { DateTime } from "luxon";

describe("reservation routes", () => {
  const initializer = new dataInitializer();

  // CREATE

  it("should return new reservation after creation", async () => {
    const links = await initializer.initLinksOrganization();
    const polito = await initializer.initPolitoOrganization();
    const politoUSer = await initializer.initPolitoUser();
    const linksUser = await initializer.initLinksUser();
    const linksManagerUser = await initializer.initLinksUser({
      organization_manager: true,
    });
    const userProject = await initializer.initFreeQueueProject(
      links,
      1000000000,
    );

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: linksManagerUser.email, sub: linksManagerUser.sub },
      signature: randomSignature,
    });

    const orgManagerToken = generateToken(
      validHeader,
      {
        id: linksManagerUser.id,
        email: linksManagerUser.email,
        sub: linksManagerUser.sub,
        roles: ["organization-manager"],
        organization: {
          id: linksManagerUser.organization_id,
          name: "Links",
        },
        administeredProjects: [userProject.id],
      },
      randomSignature,
    );

    const slot = await initializer.assignCurrentSlot(links, 1, 4);

    const now = DateTime.utc().startOf("hour");
    const start = now.plus({ hours: 1 }).toISO({ includeOffset: true });
    const end = now.plus({ hours: 2 }).toISO({ includeOffset: true });

    const res = await request(global.__APP__)
      .post(`/api/reservations`)
      .set("Authorization", `Bearer ${orgManagerToken}`)
      .send({
        slot_id: slot.id,
        project_id: userProject.id,
        start: start,
        end: end,
      })
      .expect(201);

    expect(res.body).toHaveProperty("slot_id", slot.id);
    expect(res.body).toHaveProperty("project_id", userProject.id);

    spy.mockRestore();
  });

  it("should allow reservation created in a slot of parent's organization", async () => {
    const links = await initializer.initLinksOrganization();
    const organization = await initializer.initOrganization(
      "Descendant organization",
      links.id,
      1000000000,
    );

    const organizationUser = await initializer.initUser({
      organization_id: organization.id,
      default_project_id: organization.vault_project_id,
      organization_manager: true,
    });

    // const polito = await initializer.initPolitoOrganization();
    // const politoUSer = await initializer.initPolitoUser();
    // const linksUser = await initializer.initLinksUser();
    // const linksManagerUser = await initializer.initLinksUser({
    //   organization_manager: true,
    // });
    const userProject = await initializer.initFreeQueueProject(
      organization,
      1000000000,
    );

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: organizationUser.email, sub: organizationUser.sub },
      signature: randomSignature,
    });

    const orgManagerToken = generateToken(
      validHeader,
      {
        id: organizationUser.id,
        email: organizationUser.email,
        sub: organizationUser.sub,
        roles: ["organization-manager"],
        organization: {
          id: organizationUser.organization_id,
          name: organization.name,
        },
        administeredProjects: [userProject.id],
      },
      randomSignature,
    );

    const slot = await initializer.assignCurrentSlot(links, 1, 4);

    const now = DateTime.utc().startOf("hour");
    const start = now.plus({ hours: 1 }).toISO({ includeOffset: true });
    const end = now.plus({ hours: 2 }).toISO({ includeOffset: true });

    const res = await request(global.__APP__)
      .post(`/api/reservations`)
      .set("Authorization", `Bearer ${orgManagerToken}`)
      .send({
        slot_id: slot.id,
        project_id: userProject.id,
        start: start,
        end: end,
      })
      .expect(201);

    expect(res.body).toHaveProperty("slot_id", slot.id);
    expect(res.body).toHaveProperty("project_id", userProject.id);

    spy.mockRestore();
  });

  it("should return 400 if insufficient budget", async () => {
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
        id: linksManagerUser.id,
        email: linksManagerUser.email,
        sub: linksManagerUser.sub,
        roles: ["organization-manager"],
        organization: {
          id: linksManagerUser.organization_id,
          name: "Links",
        },
        administeredProjects: [userProject.id],
      },
      randomSignature,
    );

    const slot = await initializer.assignCurrentSlot(links, 1, 4);

    const now = DateTime.utc().startOf("hour");
    const start = now.plus({ hours: 1 }).toISO({ includeOffset: true });
    const end = now.plus({ hours: 2 }).toISO({ includeOffset: true });

    const res = await request(global.__APP__)
      .post(`/api/reservations`)
      .set("Authorization", `Bearer ${orgManagerToken}`)
      .send({
        slot_id: slot.id,
        project_id: userProject.id,
        start: start,
        end: end,
      })
      .expect(400);

    //console.log(res.body);

    expect(res.body).toHaveProperty(
      "message",
      "Insufficient budget (requested: 3600000, available: 0)",
    );

    spy.mockRestore();
  });

  it("should return 400 if reservation is not aligned to hour or half hour", async () => {
    const links = await initializer.initLinksOrganization();
    const polito = await initializer.initPolitoOrganization();
    const politoUSer = await initializer.initPolitoUser();
    const linksUser = await initializer.initLinksUser();
    const linksManagerUser = await initializer.initLinksUser({
      organization_manager: true,
    });
    const userProject = await initializer.initFreeQueueProject(
      links,
      1000000000,
    );

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: linksManagerUser.email, sub: linksManagerUser.sub },
      signature: randomSignature,
    });

    const orgManagerToken = generateToken(
      validHeader,
      {
        id: linksManagerUser.id,
        email: linksManagerUser.email,
        sub: linksManagerUser.sub,
        roles: ["organization-manager"],
        organization: {
          id: linksManagerUser.organization_id,
          name: "Links",
        },
        administeredProjects: [userProject.id],
      },
      randomSignature,
    );

    const slot = await initializer.assignCurrentSlot(links, 1, 4);

    const now = DateTime.utc().startOf("hour");
    const start = now
      .plus({ hours: 1, minute: 1 })
      .toISO({ includeOffset: true });
    const end = now.plus({ hours: 2 }).toISO({ includeOffset: true });

    const res = await request(global.__APP__)
      .post(`/api/reservations`)
      .set("Authorization", `Bearer ${orgManagerToken}`)
      .send({
        slot_id: slot.id,
        project_id: userProject.id,
        start: start,
        end: end,
      })
      .expect(400);

    expect(res.body).toHaveProperty(
      "message",
      "start and end times must be aligned to the hour or half hour",
    );
    // expect(res.body).toHaveProperty("project_id", userProject.id);

    spy.mockRestore();
  });

  it("should return 400 if reservation is less than 30 minutes", async () => {
    const links = await initializer.initLinksOrganization();
    const polito = await initializer.initPolitoOrganization();
    const politoUSer = await initializer.initPolitoUser();
    const linksUser = await initializer.initLinksUser();
    const linksManagerUser = await initializer.initLinksUser({
      organization_manager: true,
    });
    const userProject = await initializer.initFreeQueueProject(
      links,
      1000000000,
    );

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: linksManagerUser.email, sub: linksManagerUser.sub },
      signature: randomSignature,
    });

    const orgManagerToken = generateToken(
      validHeader,
      {
        id: linksManagerUser.id,
        email: linksManagerUser.email,
        sub: linksManagerUser.sub,
        roles: ["organization-manager"],
        organization: {
          id: linksManagerUser.organization_id,
          name: "Links",
        },
        administeredProjects: [userProject.id],
      },
      randomSignature,
    );

    const slot = await initializer.assignCurrentSlot(links, 1, 4);

    const now = DateTime.utc().startOf("hour");
    const start = now.plus({ hours: 1 }).toISO({ includeOffset: true });
    const end = now
      .plus({ hours: 1, minutes: 29 })
      .toISO({ includeOffset: true });

    const res = await request(global.__APP__)
      .post(`/api/reservations`)
      .set("Authorization", `Bearer ${orgManagerToken}`)
      .send({
        slot_id: slot.id,
        project_id: userProject.id,
        start: start,
        end: end,
      })
      .expect(400);

    expect(res.body).toHaveProperty(
      "message",
      "minimum duration is: 30 minutes",
    );
    // expect(res.body).toHaveProperty("project_id", userProject.id);

    spy.mockRestore();
  });

  it("should return 400 if reservation is outside slot", async () => {
    const links = await initializer.initLinksOrganization();
    const polito = await initializer.initPolitoOrganization();
    const politoUSer = await initializer.initPolitoUser();
    const linksUser = await initializer.initLinksUser();
    const linksManagerUser = await initializer.initLinksUser({
      organization_manager: true,
    });
    const userProject = await initializer.initFreeQueueProject(
      links,
      1000000000,
    );

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: linksManagerUser.email, sub: linksManagerUser.sub },
      signature: randomSignature,
    });

    const orgManagerToken = generateToken(
      validHeader,
      {
        id: linksManagerUser.id,
        email: linksManagerUser.email,
        sub: linksManagerUser.sub,
        roles: ["organization-manager"],
        organization: {
          id: linksManagerUser.organization_id,
          name: "Links",
        },
        administeredProjects: [userProject.id],
      },
      randomSignature,
    );

    const slot = await initializer.assignCurrentSlot(links, 1, 1);

    const now = DateTime.utc().startOf("hour");
    const start = now.plus({ hours: 3 }).toISO({ includeOffset: true });
    const end = now.plus({ hours: 4 }).toISO({ includeOffset: true });

    const res = await request(global.__APP__)
      .post(`/api/reservations`)
      .set("Authorization", `Bearer ${orgManagerToken}`)
      .send({
        slot_id: slot.id,
        project_id: userProject.id,
        start: start,
        end: end,
      })
      .expect(400);

    expect(res.body).toHaveProperty(
      "message",
      "Reservation is outside selected slot",
    );
    // expect(res.body).toHaveProperty("project_id", userProject.id);

    spy.mockRestore();
  });

  it("should return 400 if reservation starts in the past", async () => {
    const links = await initializer.initLinksOrganization();
    const polito = await initializer.initPolitoOrganization();
    const politoUSer = await initializer.initPolitoUser();
    const linksUser = await initializer.initLinksUser();
    const linksManagerUser = await initializer.initLinksUser({
      organization_manager: true,
    });
    const userProject = await initializer.initFreeQueueProject(
      links,
      1000000000,
    );

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: linksManagerUser.email, sub: linksManagerUser.sub },
      signature: randomSignature,
    });

    const orgManagerToken = generateToken(
      validHeader,
      {
        id: linksManagerUser.id,
        email: linksManagerUser.email,
        sub: linksManagerUser.sub,
        roles: ["organization-manager"],
        organization: {
          id: linksManagerUser.organization_id,
          name: "Links",
        },
        administeredProjects: [userProject.id],
      },
      randomSignature,
    );

    const slot = await initializer.assignCurrentSlot(links, 2, 2);

    const now = DateTime.utc().startOf("hour");
    const start = now.minus({ hours: 1 }).toISO({ includeOffset: true });
    const end = now.plus({ hours: 1 }).toISO({ includeOffset: true });

    const res = await request(global.__APP__)
      .post(`/api/reservations`)
      .set("Authorization", `Bearer ${orgManagerToken}`)
      .send({
        slot_id: slot.id,
        project_id: userProject.id,
        start: start,
        end: end,
      })
      .expect(400);

    expect(res.body).toHaveProperty("message", "cannot modify in the past");

    spy.mockRestore();
  });

  it("should return 400 if end < start", async () => {
    const links = await initializer.initLinksOrganization();
    const polito = await initializer.initPolitoOrganization();
    const politoUSer = await initializer.initPolitoUser();
    const linksUser = await initializer.initLinksUser();
    const linksManagerUser = await initializer.initLinksUser({
      organization_manager: true,
    });
    const userProject = await initializer.initFreeQueueProject(
      links,
      1000000000,
    );

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: linksManagerUser.email, sub: linksManagerUser.sub },
      signature: randomSignature,
    });

    const orgManagerToken = generateToken(
      validHeader,
      {
        id: linksManagerUser.id,
        email: linksManagerUser.email,
        sub: linksManagerUser.sub,
        roles: ["organization-manager"],
        organization: {
          id: linksManagerUser.organization_id,
          name: "Links",
        },
        administeredProjects: [userProject.id],
      },
      randomSignature,
    );

    const slot = await initializer.assignCurrentSlot(links, 1, 4);

    const now = DateTime.utc().startOf("hour");
    const start = now.plus({ hours: 2 }).toISO({ includeOffset: true });
    const end = now.plus({ hours: 1 }).toISO({ includeOffset: true });

    const res = await request(global.__APP__)
      .post(`/api/reservations`)
      .set("Authorization", `Bearer ${orgManagerToken}`)
      .send({
        slot_id: slot.id,
        project_id: userProject.id,
        start: start,
        end: end,
      })
      .expect(400);

    expect(res.body).toHaveProperty("message", "please check start and end");

    spy.mockRestore();
  });

  it("should return 400 if slot is assigned to another organization", async () => {
    const links = await initializer.initLinksOrganization();
    const polito = await initializer.initPolitoOrganization();
    const politoUSer = await initializer.initPolitoUser();
    const linksUser = await initializer.initLinksUser();
    const linksManagerUser = await initializer.initLinksUser({
      organization_manager: true,
    });
    const userProject = await initializer.initFreeQueueProject(
      links,
      1000000000,
    );

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: linksManagerUser.email, sub: linksManagerUser.sub },
      signature: randomSignature,
    });

    const orgManagerToken = generateToken(
      validHeader,
      {
        id: linksManagerUser.id,
        email: linksManagerUser.email,
        sub: linksManagerUser.sub,
        roles: ["organization-manager"],
        organization: {
          id: linksManagerUser.organization_id,
          name: "Links",
        },
        administeredProjects: [userProject.id],
      },
      randomSignature,
    );

    const slot = await initializer.assignCurrentSlot(polito, 1, 4);

    const now = DateTime.utc().startOf("hour");
    const start = now.plus({ hours: 1 }).toISO({ includeOffset: true });
    const end = now.plus({ hours: 2 }).toISO({ includeOffset: true });

    const res = await request(global.__APP__)
      .post(`/api/reservations`)
      .set("Authorization", `Bearer ${orgManagerToken}`)
      .send({
        slot_id: slot.id,
        project_id: userProject.id,
        start: start,
        end: end,
      })
      .expect(400);

    expect(res.body).toHaveProperty(
      "message",
      "Selected slot is not assigned to the same organization",
    );

    spy.mockRestore();
  });

  it("should return 400 if another reservation is present at same time", async () => {
    const links = await initializer.initLinksOrganization();
    const polito = await initializer.initPolitoOrganization();
    const politoUSer = await initializer.initPolitoUser();
    const linksUser = await initializer.initLinksUser();
    const linksManagerUser = await initializer.initLinksUser({
      organization_manager: true,
    });
    const userProject = await initializer.initFreeQueueProject(
      links,
      1000000000,
    );

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: linksManagerUser.email, sub: linksManagerUser.sub },
      signature: randomSignature,
    });

    const orgManagerToken = generateToken(
      validHeader,
      {
        id: linksManagerUser.id,
        email: linksManagerUser.email,
        sub: linksManagerUser.sub,
        roles: ["organization-manager"],
        organization: {
          id: linksManagerUser.organization_id,
          name: "Links",
        },
        administeredProjects: [userProject.id],
      },
      randomSignature,
    );

    const slot = await initializer.assignCurrentSlot(links, 1, 4);

    const now = DateTime.utc().startOf("hour");
    const start = now.plus({ hours: 1 }).toISO({ includeOffset: true });
    const end = now.plus({ hours: 2 }).toISO({ includeOffset: true });

    await request(global.__APP__)
      .post(`/api/reservations`)
      .set("Authorization", `Bearer ${orgManagerToken}`)
      .send({
        slot_id: slot.id,
        project_id: userProject.id,
        start: start,
        end: end,
      })
      .expect(201);

    const start1 = now
      .plus({ hours: 1, minutes: 30 })
      .toISO({ includeOffset: true });
    const end1 = now
      .plus({ hours: 2, minutes: 30 })
      .toISO({ includeOffset: true });

    const res = await request(global.__APP__)
      .post(`/api/reservations`)
      .set("Authorization", `Bearer ${orgManagerToken}`)
      .send({
        slot_id: slot.id,
        project_id: userProject.id,
        start: start1,
        end: end1,
      })
      .expect(400);

    expect(res.body).toHaveProperty(
      "message",
      "The reservation is overlapping another reservation",
    );

    spy.mockRestore();
  });

  it("should return 400 if the project is already expired", async () => {
    const links = await initializer.initLinksOrganization();
    const polito = await initializer.initPolitoOrganization();
    const politoUSer = await initializer.initPolitoUser();
    const linksUser = await initializer.initLinksUser();
    const linksManagerUser = await initializer.initLinksUser({
      organization_manager: true,
    });
    const userProject = await initializer.initExpiredProject(links, 1000000000);

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: linksManagerUser.email, sub: linksManagerUser.sub },
      signature: randomSignature,
    });

    const orgManagerToken = generateToken(
      validHeader,
      {
        id: linksManagerUser.id,
        email: linksManagerUser.email,
        sub: linksManagerUser.sub,
        roles: ["organization-manager"],
        organization: {
          id: linksManagerUser.organization_id,
          name: "Links",
        },
        administeredProjects: [userProject.id],
      },
      randomSignature,
    );

    const slot = await initializer.assignCurrentSlot(links, 1, 4);

    const now = DateTime.utc().startOf("hour");
    const start = now.plus({ hours: 1 }).toISO({ includeOffset: true });
    const end = now.plus({ hours: 2 }).toISO({ includeOffset: true });

    const res = await request(global.__APP__)
      .post(`/api/reservations`)
      .set("Authorization", `Bearer ${orgManagerToken}`)
      .send({
        slot_id: slot.id,
        project_id: userProject.id,
        start: start,
        end: end,
      })
      .expect(400);

    expect(res.body).toHaveProperty(
      "message",
      "Project already expired at selected time",
    );

    spy.mockRestore();
  });

  it("should return 400 if the project is not yet started", async () => {
    const links = await initializer.initLinksOrganization();
    const polito = await initializer.initPolitoOrganization();
    const politoUSer = await initializer.initPolitoUser();
    const linksUser = await initializer.initLinksUser();
    const linksManagerUser = await initializer.initLinksUser({
      organization_manager: true,
    });
    const userProject = await initializer.initNotStartedProject(
      links,
      1000000000,
    );

    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: linksManagerUser.email, sub: linksManagerUser.sub },
      signature: randomSignature,
    });

    const orgManagerToken = generateToken(
      validHeader,
      {
        id: linksManagerUser.id,
        email: linksManagerUser.email,
        sub: linksManagerUser.sub,
        roles: ["organization-manager"],
        organization: {
          id: linksManagerUser.organization_id,
          name: "Links",
        },
        administeredProjects: [userProject.id],
      },
      randomSignature,
    );

    const slot = await initializer.assignCurrentSlot(links, 1, 4);

    const now = DateTime.utc().startOf("hour");
    const start = now.plus({ hours: 1 }).toISO({ includeOffset: true });
    const end = now.plus({ hours: 2 }).toISO({ includeOffset: true });

    const res = await request(global.__APP__)
      .post(`/api/reservations`)
      .set("Authorization", `Bearer ${orgManagerToken}`)
      .send({
        slot_id: slot.id,
        project_id: userProject.id,
        start: start,
        end: end,
      })
      .expect(400);

    expect(res.body).toHaveProperty(
      "message",
      "Project not yet started at selected time",
    );

    spy.mockRestore();
  });

  // it("should return 403 for user creation if not org-manager", async () => {
  //   const links = await initializer.initLinksOrganization();
  //   const polito = await initializer.initPolitoOrganization();
  //   const politoUSer = await initializer.initPolitoUser();
  //   const linksUser = await initializer.initLinksUser();
  //   // const linksManagerUser = await initializer.initLinksUser({
  //   //   organization_manager: true,
  //   // });
  //   const userProject = await initializer.initFreeQueueProject(links, 0);

  //   const spy = jest.spyOn(jwt, "decode").mockReturnValue({
  //     header: validHeader,
  //     payload: { email: linksUser.email, sub: linksUser.sub },
  //     signature: randomSignature,
  //   });

  //   const token = generateToken(
  //     validHeader,
  //     {
  //       email: linksUser.email,
  //       sub: linksUser.sub,
  //       roles: ["project-admin"],
  //       organization: {
  //         id: linksUser.organization_id,
  //         name: "Links",
  //       },
  //     },
  //     randomSignature,
  //   );

  //   const res = await request(global.__APP__)
  //     .post(`/api/users`)
  //     .set("Authorization", `Bearer ${token}`)
  //     .send({
  //       email: "testuser@links.com",
  //       organization_id: linksUser.organization_id,
  //       default_project_id: userProject.id,
  //       organization_manager: true,
  //     })
  //     .expect(403);

  //   expect(res.body).toHaveProperty("message", "Forbidden");

  //   spy.mockRestore();
  // });

  // it("should return 403 for user creation in another organization", async () => {
  //   const links = await initializer.initLinksOrganization();
  //   const polito = await initializer.initPolitoOrganization();
  //   const politoUSer = await initializer.initPolitoUser();
  //   const linksUser = await initializer.initLinksUser();
  //   const linksManagerUser = await initializer.initLinksUser({
  //     organization_manager: true,
  //   });
  //   const userProject = await initializer.initFreeQueueProject(links, 0);

  //   const spy = jest.spyOn(jwt, "decode").mockReturnValue({
  //     header: validHeader,
  //     payload: { email: linksManagerUser.email, sub: linksManagerUser.sub },
  //     signature: randomSignature,
  //   });

  //   const orgManagerToken = generateToken(
  //     validHeader,
  //     {
  //       email: linksManagerUser.email,
  //       sub: linksManagerUser.sub,
  //       roles: ["organization-manager"],
  //       organization: {
  //         id: linksManagerUser.organization_id,
  //         name: "Links",
  //       },
  //     },
  //     randomSignature,
  //   );

  //   const res = await request(global.__APP__)
  //     .post(`/api/users`)
  //     .set("Authorization", `Bearer ${orgManagerToken}`)
  //     .send({
  //       email: "testuser@links.com",
  //       organization_id: politoUSer.organization_id,
  //       default_project_id: userProject.id,
  //       organization_manager: true,
  //     })
  //     .expect(403);

  //   expect(res.body).toHaveProperty(
  //     "message",
  //     "Cannot add user to another organization",
  //   );

  //   spy.mockRestore();
  // });

  // it("an admin should be able to add users to any organization", async () => {
  //   const links = await initializer.initLinksOrganization();
  //   const polito = await initializer.initPolitoOrganization();
  //   const politoUSer = await initializer.initPolitoUser();
  //   const linksUser = await initializer.initLinksUser();
  //   const linksManagerUser = await initializer.initLinksUser({
  //     organization_manager: true,
  //   });
  //   const userProject = await initializer.initFreeQueueProject(links, 0);

  //   const spy = jest.spyOn(jwt, "decode").mockReturnValue({
  //     header: validHeader,
  //     payload: { email: linksManagerUser.email, sub: linksManagerUser.sub },
  //     signature: randomSignature,
  //   });

  //   const orgManagerToken = generateToken(
  //     validHeader,
  //     {
  //       email: linksManagerUser.email,
  //       sub: linksManagerUser.sub,
  //       roles: ["admin"],
  //       organization: {
  //         id: linksManagerUser.organization_id,
  //         name: "Links",
  //       },
  //     },
  //     randomSignature,
  //   );

  //   const res = await request(global.__APP__)
  //     .post(`/api/users`)
  //     .set("Authorization", `Bearer ${orgManagerToken}`)
  //     .send({
  //       email: "testuser@links.com",
  //       organization_id: politoUSer.organization_id,
  //       default_project_id: userProject.id,
  //       organization_manager: true,
  //     })
  //     .expect(201);

  //   spy.mockRestore();
  // });

  // // UPDATE

  // it("should return updated user after update", async () => {
  //   const links = await initializer.initLinksOrganization();
  //   const polito = await initializer.initPolitoOrganization();
  //   const politoUSer = await initializer.initPolitoUser();
  //   const linksUser = await initializer.initLinksUser();
  //   const linksManagerUser = await initializer.initLinksUser({
  //     organization_manager: true,
  //   });
  //   const userProject = await initializer.initFreeQueueProject(links, 0);

  //   const spy = jest.spyOn(jwt, "decode").mockReturnValue({
  //     header: validHeader,
  //     payload: { email: linksManagerUser.email, sub: linksManagerUser.sub },
  //     signature: randomSignature,
  //   });

  //   const orgManagerToken = generateToken(
  //     validHeader,
  //     {
  //       email: linksManagerUser.email,
  //       sub: linksManagerUser.sub,
  //       roles: ["organization-manager"],
  //       organization: {
  //         id: linksManagerUser.organization_id,
  //         name: "Links",
  //       },
  //     },
  //     randomSignature,
  //   );

  //   const res = await request(global.__APP__)
  //     .put(`/api/users/${linksUser.id}`)
  //     .set("Authorization", `Bearer ${orgManagerToken}`)
  //     .send({
  //       email: "testuser@links.com",
  //       organization_id: linksManagerUser.organization_id,
  //       // default_project_id: userProject.id,
  //       organization_auditor: true,
  //     })
  //     .expect(200);

  //     //console.log(res.body)

  //   expect(res.body).toHaveProperty("email", "testuser@links.com");
  //   expect(res.body).toHaveProperty(
  //     "organization_id",
  //     linksManagerUser.organization_id,
  //   );
  //   //expect(res.body).toHaveProperty("default_project_id", userProject.id);
  //   expect(res.body).toHaveProperty("organization_auditor", true);
  //   expect(res.body).toHaveProperty("organization_manager", false);

  //   spy.mockRestore();
  // });

  // it("should return 403 for user update if not org-manager", async () => {
  //   const links = await initializer.initLinksOrganization();
  //   const polito = await initializer.initPolitoOrganization();
  //   const politoUSer = await initializer.initPolitoUser();
  //   const linksUser = await initializer.initLinksUser();
  //   // const linksManagerUser = await initializer.initLinksUser({
  //   //   organization_manager: true,
  //   // });
  //   const userProject = await initializer.initFreeQueueProject(links, 0);

  //   const spy = jest.spyOn(jwt, "decode").mockReturnValue({
  //     header: validHeader,
  //     payload: { email: linksUser.email, sub: linksUser.sub },
  //     signature: randomSignature,
  //   });

  //   const token = generateToken(
  //     validHeader,
  //     {
  //       email: linksUser.email,
  //       sub: linksUser.sub,
  //       roles: ["project-admin"],
  //       organization: {
  //         id: linksUser.organization_id,
  //         name: "Links",
  //       },
  //     },
  //     randomSignature,
  //   );

  //   const res = await request(global.__APP__)
  //     .put(`/api/users/${politoUSer.id}`)
  //     .set("Authorization", `Bearer ${token}`)
  //     .send({
  //       email: "testuser@links.com",
  //       organization_id: linksUser.organization_id,
  //       default_project_id: userProject.id,
  //       organization_manager: true,
  //     })
  //     .expect(403);

  //   expect(res.body).toHaveProperty("message", "Forbidden");

  //   spy.mockRestore();
  // });

  // it("should return 403 for user update into another organization", async () => {
  //   const links = await initializer.initLinksOrganization();
  //   const polito = await initializer.initPolitoOrganization();
  //   const politoUSer = await initializer.initPolitoUser();
  //   const linksUser = await initializer.initLinksUser();
  //   const linksManagerUser = await initializer.initLinksUser({
  //     organization_manager: true,
  //   });
  //   const userProject = await initializer.initFreeQueueProject(links, 0);

  //   const spy = jest.spyOn(jwt, "decode").mockReturnValue({
  //     header: validHeader,
  //     payload: { email: linksManagerUser.email, sub: linksManagerUser.sub },
  //     signature: randomSignature,
  //   });

  //   const orgManagerToken = generateToken(
  //     validHeader,
  //     {
  //       email: linksManagerUser.email,
  //       sub: linksManagerUser.sub,
  //       roles: ["organization-manager"],
  //       organization: {
  //         id: linksManagerUser.organization_id,
  //         name: "Links",
  //       },
  //     },
  //     randomSignature,
  //   );

  //   const res = await request(global.__APP__)
  //     .put(`/api/users/${linksUser.id}`)
  //     .set("Authorization", `Bearer ${orgManagerToken}`)
  //     .send({
  //       email: "testuser@links.com",
  //       organization_id: politoUSer.organization_id,
  //       default_project_id: userProject.id,
  //       organization_manager: true,
  //     })
  //     .expect(403);

  //   expect(res.body).toHaveProperty(
  //     "message",
  //     "Cannot update user from another organization",
  //   );

  //   spy.mockRestore();
  // });

  // it("an admin should be able to update users into any organization", async () => {
  //   const links = await initializer.initLinksOrganization();
  //   const polito = await initializer.initPolitoOrganization();
  //   const politoUSer = await initializer.initPolitoUser();
  //   const linksUser = await initializer.initLinksUser();
  //   const linksManagerUser = await initializer.initLinksUser({
  //     organization_manager: true,
  //   });
  //   const userProject = await initializer.initFreeQueueProject(links, 0);

  //   const spy = jest.spyOn(jwt, "decode").mockReturnValue({
  //     header: validHeader,
  //     payload: { email: linksManagerUser.email, sub: linksManagerUser.sub },
  //     signature: randomSignature,
  //   });

  //   const orgManagerToken = generateToken(
  //     validHeader,
  //     {
  //       email: linksManagerUser.email,
  //       sub: linksManagerUser.sub,
  //       roles: ["admin"],
  //       organization: {
  //         id: linksManagerUser.organization_id,
  //         name: "Links",
  //       },
  //     },
  //     randomSignature,
  //   );

  //   const res = await request(global.__APP__)
  //     .put(`/api/users/${linksUser.id}`)
  //     .set("Authorization", `Bearer ${orgManagerToken}`)
  //     .send({
  //       email: "testuser@links.com",
  //       organization_id: politoUSer.organization_id,
  //       //default_project_id: userProject.id,
  //       organization_manager: true,
  //     })
  //     .expect(200);

  //   expect(res.body).toHaveProperty(
  //     "organization_id",
  //     politoUSer.organization_id,
  //   );

  //   spy.mockRestore();
  // });

  // TODO: add checks for default project changes
});
