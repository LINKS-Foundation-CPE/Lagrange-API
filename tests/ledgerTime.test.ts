import {
  ledgerDescription,
  ledgerInstant,
  ledgerWindow,
} from "../src/utils/ledgerTime.ts";

describe("ledger times", () => {
  afterEach(() => delete process.env.LEDGER_TIME_ZONE);

  it("is ISO 8601 UTC by default, never the JavaScript Date string", () => {
    const text = ledgerWindow(
      new Date("2026-11-17T22:58:56Z"),
      new Date("2026-11-17T23:03:09.250Z"),
    );
    expect(text).toBe("2026-11-17T22:58:56Z - 2026-11-17T23:03:09.250Z");
    expect(text).not.toContain("GMT");
  });

  it("adds local time when LEDGER_TIME_ZONE is set", () => {
    process.env.LEDGER_TIME_ZONE = "Europe/Rome";
    expect(
      ledgerWindow(
        new Date("2026-11-17T22:58:56Z"),
        new Date("2026-11-17T23:03:09Z"),
      ),
    ).toBe(
      "2026-11-17T22:58:56Z - 2026-11-17T23:03:09Z (Europe/Rome 2026-11-17 23:58:56 - 2026-11-18 00:03:09)",
    );
  });

  it("ignores an invalid zone", () => {
    process.env.LEDGER_TIME_ZONE = "Mars/Olympus";
    expect(ledgerInstant(new Date("2026-11-17T22:58:56Z"))).toBe(
      "2026-11-17T22:58:56Z",
    );
  });

  it("keeps descriptions within 255 characters", () => {
    expect(ledgerDescription("x".repeat(300))).toHaveLength(255);
  });
});
