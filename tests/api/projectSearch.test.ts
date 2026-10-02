import request from "supertest";
import jwt from "jsonwebtoken";
import {
  validHeader,
  generateToken,
  randomSignature,
} from "../utils/tokenUtils.ts";
import dataInitializer from "../utils/dataInitializer.ts";
import * as projectRepo from "../../src/repositories/project.repository.ts";

/**
 * Free-text search on the project list.
 *
 * The point of these is the *substring* part. Project names here follow a
 * convention where the distinguishing word is rarely at the front, so a prefix
 * match would find nothing anyone is actually looking for.
 */
describe("GET /api/projects — free-text search", () => {
  const initializer = new dataInitializer();

  const search = async (q: string) => {
    const admin = await initializer.initLinksUser();
    const spy = jest.spyOn(jwt, "decode").mockReturnValue({
      header: validHeader,
      payload: { email: admin.email, sub: admin.sub },
      signature: randomSignature,
    });
    const token = generateToken(
      validHeader,
      { email: admin.email, sub: admin.sub, roles: ["admin"] },
      randomSignature,
    );
    const res = await request(global.__APP__)
      .get(`/api/projects?filter=${encodeURIComponent(JSON.stringify({ q }))}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    spy.mockRestore();
    return (res.body as Array<{ name: string }>).map((p) => p.name).sort();
  };

  const seed = async () => {
    const links = await initializer.initLinksOrganization();
    for (const name of [
      "CINECA-2026-lattice",
      "CINECA-2026-qaoa",
      "POLITO-2025-qaoa",
    ]) {
      await projectRepo.create({
        name,
        free_queue: false,
        organization_id: links.id,
      });
    }
  };

  it("matches a substring, not only a prefix", async () => {
    await seed();
    // "qaoa" is in the middle of nothing and at the end of two — a prefix
    // match would return neither.
    expect(await search("qaoa")).toEqual([
      "CINECA-2026-qaoa",
      "POLITO-2025-qaoa",
    ]);
  });

  it("is case-insensitive", async () => {
    await seed();
    expect(await search("QAOA")).toEqual([
      "CINECA-2026-qaoa",
      "POLITO-2025-qaoa",
    ]);
  });

  it("still matches on a prefix", async () => {
    await seed();
    expect(await search("CINECA")).toEqual([
      "CINECA-2026-lattice",
      "CINECA-2026-qaoa",
    ]);
  });

  it("returns nothing rather than everything when there is no match", async () => {
    await seed();
    expect(await search("no-such-project")).toEqual([]);
  });
});
