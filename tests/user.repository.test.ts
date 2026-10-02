import * as userRepo from "../src/repositories/user.repository";

const userData = { email: "fab@test.com", sub: "test-sub" };

describe("User repo", () => {
  it("should create a user", async () => {
    const { User } = global.__MODELS__;

    await userRepo.create(userData);

    const users = await User.findAndCountAll();

    expect(users.count).toBe(1);
    expect(users.rows).toBeDefined();
    const user = users.rows[0];
    expect(user).toBeDefined();

    expect(user.toJSON()).toMatchObject({
      id: user.id,
      ...userData,
    });
  });

  it("should get a user by id", async () => {
    const { User } = global.__MODELS__;

    await userRepo.create(userData);

    const users = await User.findAndCountAll();
    const userId = users.rows[0].id;
    const user = await userRepo.getOne(userId);

    expect(user).toBeDefined();
    expect(user.toJSON()).toMatchObject({
      id: userId,
      ...userData,
    });
  });

  it("should get a user by sub", async () => {
    const { User } = global.__MODELS__;

    await userRepo.create(userData);

    const users = await User.findAndCountAll();
    const userId = users.rows[0].id;
    const user = await userRepo.getBySub(userData.sub);

    expect(user).toBeDefined();
    expect(user?.toJSON()).toMatchObject({
      id: userId,
      ...userData,
    });
  });

  it("should get a user by email", async () => {
    const { User } = global.__MODELS__;

    await userRepo.create(userData);

    const users = await User.findAndCountAll();
    const userId = users.rows[0].id;
    const user = await userRepo.getByEmail(userData.email);

    expect(user).toBeDefined();
    expect(user?.toJSON()).toMatchObject({
      id: userId,
      ...userData,
    });
  });
});
