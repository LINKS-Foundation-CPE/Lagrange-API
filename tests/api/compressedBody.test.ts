import { brotliCompressSync, gzipSync } from "node:zlib";
import request from "supertest";

/**
 * Compressed request bodies are refused before anything decompresses them:
 * body parsing runs ahead of authentication, so a body that reached node:zlib
 * would be attacker-supplied data in the decoder (CVE-2026-111497).
 */
describe("compressed request bodies", () => {
  const body = Buffer.from(JSON.stringify({ jobid: "x" }));

  it.each([
    ["br", brotliCompressSync(body)],
    ["gzip", gzipSync(body)],
  ])(
    "refuses Content-Encoding: %s with 415, without auth",
    async (encoding, payload) => {
      await request(global.__APP__)
        .post("/jobReport")
        .set("Content-Type", "application/json")
        .set("Content-Encoding", encoding)
        .send(payload)
        .expect(415);
    },
  );

  it("answers malformed JSON with 400, not 500", async () => {
    await request(global.__APP__)
      .post("/jobReport")
      .set("Content-Type", "application/json")
      .send("{not json")
      .expect(400);
  });

  it("still accepts plain JSON", async () => {
    const res = await request(global.__APP__)
      .post("/jobReport")
      .set("Content-Type", "application/json")
      .send({});
    expect(res.status).not.toBe(415);
  });
});
