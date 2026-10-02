import { Sequelize } from "sequelize";
import jwt from "jsonwebtoken";
import { initModels } from "../src/models";
import { createApp } from "../src/app";

let sequelize: Sequelize;
let models: ReturnType<typeof initModels>;

jest.mock("jwks-rsa", () => {
  return () => ({
    getSigningKey: jest.fn().mockResolvedValue({
      getPublicKey: () => "fake-public-key",
    }),
  });
});

jest.mock("jsonwebtoken", () => {
  const original = jest.requireActual("jsonwebtoken");
  return {
    ...original,
    verify: jest.fn().mockImplementation((data) => {
      const split = data.split(".");
      const bufferPayload = Buffer.from(split[1], "base64");
      const decodedPayload = JSON.parse(bufferPayload.toString("utf8"));
      return decodedPayload;
    }),
  };
});

beforeAll(async () => {
  // sequelize = sequelize = new Sequelize({
  //   dialect: "sqlite",
  //   storage: ":memory:",
  //   logging: false,
  // });

  sequelize = new Sequelize("quantumtest", "test", "5wnyYu4kmmo", {
    dialect: "postgres",
    host: process.env.TEST_DB_HOST || "localhost",
    port: parseInt(process.env.TEST_DB_PORT || "5433"),
    dialectOptions: {
      // Your pg options here
    },
    logging: false, //(msg) => logger.debug(msg), console.log,
  });
  models = initModels(sequelize);

  await sequelize.drop();
  try {
    await sequelize.sync({ force: true });
  } catch (err) {
    console.log(err);
  }

  // try {
  //   await sequelize.sync({ force: true });
  // } catch (err) {
  //   console.log(err);
  // }

  global.__SEQUELIZE__ = sequelize;
  global.__APP__ = createApp(sequelize);
  global.__MODELS__ = models;
});

beforeEach(async () => {
  for (const modelName of Object.keys(models)) {
    try {
      await models[modelName].destroy({
        where: {},
        truncate: true,
        cascade: true,
      });
    } catch (err) {
      console.log(err);
    }
  }
});

// beforeEach(async () => {
//   // for (const modelName of Object.keys(models)) {
//   //   await models[modelName].destroy({ where: {}, force: true });
//   // }
//   try {
//     await sequelize.drop();
//     await sequelize.sync({ force: true });
//   } catch (err) {
//     console.log(err);
//   }
// });

afterAll(async () => {
  await sequelize.close();
});
