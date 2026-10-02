import request from "supertest";
import dataInitializer from "../utils/dataInitializer.ts";
import * as projectRepo from "../../src/repositories/project.repository.ts";
import { generateToken, validHeader } from "../utils/tokenUtils.ts";

/**
 * Tags are an admin-defined controlled vocabulary that project admins assign to
 * their own projects. The two halves of that sentence are the two things worth
 * testing: only admins can change the vocabulary, and assignment cannot invent
 * a term that is not in it.
 */
describe("tags", () => {
  const initializer = new dataInitializer();

  // The suite mocks jwt.verify to base64-decode the payload, so a token is just
  // the claims `authenticateJWT` puts on req.user.
  const admin = () =>
    generateToken(validHeader, {
      id: 1,
      sub: "tags-admin",
      email: "admin@test",
      roles: ["admin"],
      administeredProjects: [],
    });

  const pi = (administeredProjects: number[], organizationId?: number) =>
    generateToken(validHeader, {
      id: 2,
      sub: "tags-pi",
      email: "pi@test",
      roles: ["project-admin"],
      organization: organizationId ? { id: organizationId } : undefined,
      administeredProjects,
    });

  const createTag = (name: string) =>
    request(global.__APP__)
      .post("/api/tags")
      .set("Authorization", `Bearer ${admin()}`)
      .send({ name });

  describe("the vocabulary", () => {
    it("is created and listed by an admin", async () => {
      await createTag("materials").expect(200);
      await createTag("chemistry").expect(200);

      const res = await request(global.__APP__)
        .get("/api/tags")
        .set("Authorization", `Bearer ${admin()}`)
        .expect(200);

      expect(res.body.map((t: { name: string }) => t.name).sort()).toEqual([
        "chemistry",
        "materials",
      ]);
      // react-admin needs the total, not the page length.
      expect(res.headers["content-range"]).toBeDefined();
    });

    it("trims the name and refuses a duplicate", async () => {
      const created = await createTag("  spaced  ").expect(200);
      expect(created.body.name).toEqual("spaced");
      await createTag("spaced").expect(409);
    });

    it("refuses an empty name", async () => {
      await createTag("   ").expect(400);
    });

    it("cannot be changed by a non-admin", async () => {
      const org = await initializer.initPolitoOrganization();
      const token = pi([], org.id);
      await request(global.__APP__)
        .post("/api/tags")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "sneaky" })
        .expect(403);
    });

    it("is readable by a non-admin, who has to pick from it", async () => {
      await createTag("readable").expect(200);
      const org = await initializer.initPolitoOrganization();
      const token = pi([], org.id);
      const res = await request(global.__APP__)
        .get("/api/tags")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it("refuses to delete a tag a project still carries", async () => {
      const org = await initializer.initPolitoOrganization();
      const project = await initializer.initFreeQueueProject(org);
      const tag = await createTag("in-use").expect(200);

      await request(global.__APP__)
        .put(`/api/projects/${project.id}/tags`)
        .set("Authorization", `Bearer ${admin()}`)
        .send({ tag_ids: [tag.body.id] })
        .expect(200);

      await request(global.__APP__)
        .delete(`/api/tags/${tag.body.id}`)
        .set("Authorization", `Bearer ${admin()}`)
        .expect(409);

      // Unassigned, it deletes.
      await request(global.__APP__)
        .put(`/api/projects/${project.id}/tags`)
        .set("Authorization", `Bearer ${admin()}`)
        .send({ tag_ids: [] })
        .expect(200);
      await request(global.__APP__)
        .delete(`/api/tags/${tag.body.id}`)
        .set("Authorization", `Bearer ${admin()}`)
        .expect(200);
    });
  });

  describe("assignment", () => {
    it("lets a project admin tag a project they administer, and not one they do not", async () => {
      const org = await initializer.initPolitoOrganization();
      const mine = await initializer.initFreeQueueProject(org);
      const theirs = await initializer.initNoFreeQueueProject(org);
      const tag = await createTag("mine").expect(200);

      const token = pi([mine.id], org.id);

      await request(global.__APP__)
        .put(`/api/projects/${mine.id}/tags`)
        .set("Authorization", `Bearer ${token}`)
        .send({ tag_ids: [tag.body.id] })
        .expect(200);

      await request(global.__APP__)
        .put(`/api/projects/${theirs.id}/tags`)
        .set("Authorization", `Bearer ${token}`)
        .send({ tag_ids: [tag.body.id] })
        .expect(403);
    });

    it("rejects a tag id that is not in the vocabulary", async () => {
      const org = await initializer.initPolitoOrganization();
      const project = await initializer.initFreeQueueProject(org);
      const res = await request(global.__APP__)
        .put(`/api/projects/${project.id}/tags`)
        .set("Authorization", `Bearer ${admin()}`)
        .send({ tag_ids: [999_999] })
        .expect(400);
      expect(res.body.message).toMatch(/unknown tag id/i);
    });

    it("replaces the whole set, and an empty array clears it", async () => {
      const org = await initializer.initPolitoOrganization();
      const project = await initializer.initFreeQueueProject(org);
      const a = await createTag("a").expect(200);
      const b = await createTag("b").expect(200);
      const c = await createTag("c").expect(200);

      const put = (ids: number[]) =>
        request(global.__APP__)
          .put(`/api/projects/${project.id}/tags`)
          .set("Authorization", `Bearer ${admin()}`)
          .send({ tag_ids: ids })
          .expect(200);

      let res = await put([a.body.id, b.body.id]);
      expect(res.body.map((t: { name: string }) => t.name).sort()).toEqual([
        "a",
        "b",
      ]);

      res = await put([c.body.id]);
      expect(res.body.map((t: { name: string }) => t.name)).toEqual(["c"]);

      res = await put([]);
      expect(res.body).toEqual([]);
    });

    it("ignores a repeated id rather than duplicating the row", async () => {
      const org = await initializer.initPolitoOrganization();
      const project = await initializer.initFreeQueueProject(org);
      const tag = await createTag("once").expect(200);
      const res = await request(global.__APP__)
        .put(`/api/projects/${project.id}/tags`)
        .set("Authorization", `Bearer ${admin()}`)
        .send({ tag_ids: [tag.body.id, tag.body.id] })
        .expect(200);
      expect(res.body.length).toEqual(1);
    });
  });

  describe("the project read path", () => {
    it("returns tags on a project, and paginates correctly despite the join", async () => {
      const org = await initializer.initPolitoOrganization();
      const projects = [];
      for (let i = 0; i < 5; i++) {
        projects.push(
          await projectRepo.create({
            name: `tagged-project-${i}-${Math.floor(Math.random() * 100000)}`,
            free_queue: false,
            remaining_budget: 0,
            organization_id: org.id,
          }),
        );
      }
      const a = await createTag("x").expect(200);
      const b = await createTag("y").expect(200);
      // Two tags on one project is what would double-count a naive join.
      await request(global.__APP__)
        .put(`/api/projects/${projects[0].id}/tags`)
        .set("Authorization", `Bearer ${admin()}`)
        .send({ tag_ids: [a.body.id, b.body.id] })
        .expect(200);

      const one = await request(global.__APP__)
        .get(`/api/projects/${projects[0].id}`)
        .set("Authorization", `Bearer ${admin()}`)
        .expect(200);
      expect(one.body.tags.map((t: { name: string }) => t.name).sort()).toEqual(
        ["x", "y"],
      );

      const list = await request(global.__APP__)
        .get("/api/projects")
        .set("Authorization", `Bearer ${admin()}`)
        .expect(200);
      // The org vault project is created alongside the organization, so assert
      // the relationship rather than a magic number: the total must equal the
      // number of distinct projects, not project-tag pairs.
      const total = Number(list.headers["content-range"].split("/")[1]);
      const ids = new Set(list.body.map((p: { id: number }) => p.id));
      expect(total).toEqual(ids.size);
      expect(total).toBeLessThan(projects.length + 2 + 1);
    });
  });
});
