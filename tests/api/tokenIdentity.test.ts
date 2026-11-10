import { identityOf } from "../../src/routes/token.ts";
import { _setUsernameFormatForTests } from "../../src/config/usernamePolicy.ts";

/**
 * The identity a Keycloak token resolves to, i.e. what lands in `users.email`
 * and therefore what a job report has to name for a user to see their own jobs.
 *
 * Sites running USERNAME_FORMAT=any identify users by something that is not an
 * e-mail — an HPC account name — and their Keycloak users have no e-mail at all,
 * because Keycloak validates the format of that field.
 */
describe("identityOf", () => {
  const base = { sub: "s", realm_access: { roles: [] } };

  beforeEach(() => _setUsernameFormatForTests("any"));
  afterAll(() => _setUsernameFormatForTests(null));

  it("uses the e-mail claim when there is one", () => {
    expect(
      identityOf({ ...base, email: "a@example.com", preferred_username: "a" }),
    ).toEqual("a@example.com");
  });

  it("falls back to preferred_username when the user has no e-mail", () => {
    expect(identityOf({ ...base, preferred_username: "hpcuser" })).toEqual(
      "hpcuser",
    );
  });

  it("treats an empty e-mail as absent", () => {
    expect(
      identityOf({ ...base, email: "", preferred_username: "hpcuser" }),
    ).toEqual("hpcuser");
  });

  it("is undefined when the token carries neither", () => {
    expect(identityOf(base)).toBeUndefined();
  });

  it("never falls back under USERNAME_FORMAT=email (the Lagrange default)", () => {
    _setUsernameFormatForTests("email");
    expect(
      identityOf({ ...base, preferred_username: "hpcuser" }),
    ).toBeUndefined();
    expect(
      identityOf({ ...base, email: "a@example.com", preferred_username: "a" }),
    ).toEqual("a@example.com");
  });
});
