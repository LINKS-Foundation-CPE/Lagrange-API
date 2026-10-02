import logger from "config/logger.ts";
import { ActionLog } from "../models/index.ts";

type logParameters = {
  userId: number | null;
  action: string;
  resource?: string;
  resourceId?: number;
  description: string;
};

const logToDatabase = async ({
  userId,
  action,
  resource,
  resourceId,
  description,
}: logParameters) => {
  try {
    await ActionLog.create({
      timestamp: new Date(),
      user_id: userId,
      action,
      resource,
      resource_id: resourceId,
      description,
    });
  } catch (err) {
    logger.error("Error in logToDatabase during ActionLog.create");
    logger.error(
      `Parameters: userId: ${userId} action: ${action} resource: ${resource} resourceId: ${resourceId} \n\tdescription: ${description}`,
    );
    logger.error(err);
  }
};

export { logToDatabase };
