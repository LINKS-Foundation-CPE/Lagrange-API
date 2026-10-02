import { logToDatabase } from "../src/utils";
import dataInitializer from "./utils/dataInitializer";

describe("logToDatabase", () => {
  const initializer = new dataInitializer();

  it("should create a log with null userid", async () => {
    const { ActionLog } = global.__MODELS__;
    await logToDatabase({
      userId: null,
      action: "test",
      resource: "tests",
      resourceId: 2,
      description: "this is a test",
    });

    const logs = await ActionLog.findAndCountAll();

    expect(logs.count).toBe(1);
    expect(logs.rows).toBeDefined();
  });

  it("should create a log", async () => {
    const { ActionLog } = global.__MODELS__;

    await logToDatabase({
      userId: null,
      action: "test",
      resource: "tests",
      resourceId: 2,
      description: "this is a test",
    });

    const links = await initializer.initLinksOrganization();
    const user = await initializer.initLinksUser();
    await logToDatabase({
      userId: user.id,
      action: "test",
      resource: "tests",
      resourceId: 2,
      description: "this is a test",
    });

    const logs = await ActionLog.findAndCountAll();

    expect(logs.count).toBe(2);
    expect(logs.rows).toBeDefined();
    const firstLog = logs.rows[1];
    expect(firstLog).toBeDefined();

    expect(firstLog.toJSON()).toMatchObject({
      user_id: user.id,
      action: "test",
      resource: "tests",
      resource_id: 2,
      description: "this is a test",
    });
    // expect ((logs.rows)[0]).toMatchObject({id: 0, timestamp: 0, user_id: 1, action: "test", resource: "tests", resource_id: 0, description: "this is a test"})
  });
});
