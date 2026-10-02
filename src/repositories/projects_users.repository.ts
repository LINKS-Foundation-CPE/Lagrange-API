import { ProjectUser } from "../models/index.ts";

export const getOne = (id: number) => ProjectUser.findByPk(id);

export const isUserInProject = async (
  userId: number,
  projectId: number,
): Promise<boolean> => {
  const projectUser = await ProjectUser.findOne({
    where: {
      user_id: userId,
      project_id: projectId,
    },
  });

  return !!projectUser; // true if record exists, false otherwise
};

export const destroy = async (id: number) => {
  const record = await ProjectUser.findByPk(id);
  return record?.destroy();
};
