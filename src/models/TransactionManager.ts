import { Sequelize, Transaction } from "sequelize";

export class TransactionManager {
  private sequelize: Sequelize;

  constructor(sequelize: Sequelize) {
    this.sequelize = sequelize;
  }

  async withTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    const transaction = await this.sequelize.transaction();
    try {
      const result = await fn(transaction);
      await transaction.commit();
      return result;
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }
}
