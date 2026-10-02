import { CreateUserDto, UpdateUserDto } from "schemas/user.schema.ts";

import * as organizationRepo from "repositories/organization.repository.ts";
import * as projectRepo from "repositories/project.repository.ts";
import * as repo from "repositories/user.repository.ts";
import * as projectsUsersRepo from "repositories/projects_users.repository.ts";
import * as jobsRepo from "repositories/job.repository.ts";
import { transactionManager, User } from "models/index.ts";
import { logToDatabase } from "utils/index.ts";
import CustomError from "config/CustomError.ts";
import logger from "config/logger.ts";
import { Op, Order, UniqueConstraintError, ValidationError } from "sequelize";
import { AuthUser } from "../types/auth.ts";

export const getList = async (
  user: AuthUser,
  filter: Record<string, unknown>,
  limit?: number,
  offset?: number,
  order?: Order,
) => {
  // Free-text search (react-admin SearchInput sends `q`): case-insensitive
  // substring match on the user's email.
  if (filter.q) {
    const q = String(filter.q);
    delete filter.q;
    filter.email = { [Op.iLike]: `%${q}%` };
  }

  // Org-managers only see users from their own organization; admins and
  // read-only admins keep the full, unscoped list.
  if (
    !user.roles.includes("admin") &&
    !user.roles.includes("readOnlyAdmin") &&
    user.roles.includes("organization-manager")
  ) {
    filter.organization_id = user.organization.id;
  }

  return repo.getList(filter, limit, offset, order);
};

/**
 * Pulse (sweep) access is a platform-admin grant, so a non-admin's payload
 * never gets to set it.
 *
 * Dropped rather than refused. The dashboard hides the control from
 * organization managers, but a form submits the record it loaded, so a manager
 * saving an unrelated change would otherwise be rejected over a field they
 * never saw. Ignoring it cannot escalate anything; refusing it would break the
 * form.
 *
 * This matters more than it used to: `/jobAuthorizer` now decides pulse access
 * from this flag, so whoever can set it can grant machine capability.
 */
const dropPulseAccessUnlessAdmin = (
  data: { pulla_user?: boolean | null },
  user: AuthUser,
) => {
  if (!user.roles.includes("admin")) delete data.pulla_user;
};

export const update = async (
  id: number,
  data: UpdateUserDto,
  user: AuthUser,
) => {
  dropPulseAccessUnlessAdmin(data, user);

  // Default the organization to the caller's own. Platform admins have no
  // organization of their own, so a partial update from an admin (e.g. only
  // toggling Pulse access) simply leaves the field alone — the record keeps
  // whatever organization it already had.
  if (!data.organization_id && user.organization)
    data.organization_id = user.organization.id;

  const currentUser = await repo.getOne(id);

  if (!currentUser)
    throw new CustomError({
      statusCode: 404,
      message: `#${id} not found`,
    });

  if (
    !user.roles.includes("admin") &&
    data.organization_id !== user.organization?.id
  ) {
    throw new CustomError({
      statusCode: 403,
      message: "Cannot update user from another organization",
    });
  }

  if (
    !user.roles.includes("admin") &&
    data.organization_id !== user.organization?.id
  ) {
    throw new CustomError({
      statusCode: 403,
      message: "Cannot set user into another organization",
    });
  }

  // check if default project changed
  if (
    data.default_project_id &&
    currentUser.default_project_id !== data.default_project_id
  ) {
    // check if user is part of project
    const isUserInProject = await projectsUsersRepo.isUserInProject(
      id,
      data.default_project_id,
    );
    if (!isUserInProject)
      throw new CustomError({
        statusCode: 400,
        message: `User is not part of that project`,
      });
  }

  const record = await repo.update(id, data);

  return record;
};

export const create = async (data: CreateUserDto, user: AuthUser) => {
  dropPulseAccessUnlessAdmin(data, user);

  const { default_project_id } = data;

  // instantiate organization id as user organization
  if (!data.organization_id) data.organization_id = user.organization.id;

  if (
    !user.roles.includes("admin") &&
    data.organization_id !== user.organization.id
  ) {
    throw new CustomError({
      statusCode: 403,
      message: "Cannot add user to another organization",
    });
  }

  return transactionManager.withTransaction(async (tx) => {
    // TODO: check if default_project is of the same organization (?)

    try {
      const user = await repo.create(data, { transaction: tx });

      // TODO: handle user alredy in database (logged in before) - or don't autoregister users

      // add user to its default project
      if (default_project_id) {
        const project = await projectRepo.getOne(default_project_id);

        if (!project) {
          throw new CustomError({
            statusCode: 400,
            message: "project not found",
          });
        }

        await project.addUser(user, { transaction: tx });
      }

      return user;
    } catch (err) {
      if (
        err instanceof UniqueConstraintError &&
        // err.name === "SequelizeUniqueConstraintError" &&
        Object.keys(err.fields).length == 1 &&
        err.fields.email
      ) {
        logger.info(`User already registered: ${data.email}`);
        throw new CustomError({
          statusCode: 400,
          message: "User already registered",
        });
      } else {
        logger.error(err);
        throw err;
      }
    }
  });
};

export const getOne = async (id: number) => {
  const record = repo.getOne(id);

  if (!record)
    throw new CustomError({
      statusCode: 404,
      message: `#${id} not found`,
    });

  return record;
};

export const getUserProjects = async (
  id: number,
  filter: Record<string, unknown>,
  limit?: number,
  offset?: number,
  order?: Order,
) => {
  return projectRepo.getUserProjects(id, filter, limit, offset, order);
};

export const getUserJobs = async (
  id: number,
  filter: Record<string, unknown>,
  limit?: number,
  offset?: number,
  order?: Order,
) => {
  // TODO: join original filter
  return jobsRepo.getList({ user_id: id }, limit, offset, order);
};

export const getUserDefaultProject = async (id: number) => {
  return repo.getUserDefaultProject(id);
};

export const setUserDefaultProject = async (
  userId: number,
  projectId: number,
) => {
  const user = await getOne(userId);
  const hasProject = await user!.hasProject(projectId);

  // verify that user is part of selected project
  if (!hasProject) {
    throw new CustomError({
      statusCode: 403,
      message: `Not member of project #${projectId}`,
    });
  }
  // use directly update instead of a dedicated function?
  return repo.setUserDefaultProject(userId, projectId);
};

/**
 * Platform roles for a user identity, consumed by the QC Gateway's auth
 * plugin (machine endpoint /userRoles). Every DB-included user is a
 * cortex_user (circuit submission); pulla_user (sweep submission, "Pulse
 * access" in the dashboard) follows the per-user `pulla_user` flag, which is
 * seeded from the identity provider when the user is first registered
 * (:func:`hasPulseAccessOidcRole`) and changed by an admin thereafter. Returns
 * null when the identity is unknown.
 */
export const getRolesByUsername = async (
  username: string,
): Promise<string[] | null> => {
  const user = await repo.getByEmail(username);
  if (!user) return null;
  const roles = ["cortex_user"];
  if (user.pulla_user) roles.push("pulla_user");
  return roles;
};

/**
 * Realm role that seeds Pulse (sweep) access at first registration.
 * Deployment-configurable because realms name it differently; the rest of the
 * OIDC-claim → platform-role mapping is still hardcoded in the token route.
 */
export const pulseAccessOidcRole = (): string =>
  process.env.PULSE_ACCESS_OIDC_ROLE?.trim() || "pulla_user";

/**
 * Whether the identity provider grants Pulse (sweep) access to this identity.
 *
 * Used once, when a Keycloak login registers a user row that did not exist
 * yet: the realm role seeds `users.pulla_user` so that HPC principals — whose
 * SPANK tokens carry no roles, and for whom the gateway's /userRoles lookup is
 * the only source — start with the access the realm already gives them.
 *
 * It is a default, not a mirror. Once the row exists the platform is
 * authoritative and only an admin changes the flag, so a revocation made in the
 * dashboard is not undone by the user's next login. Restoring access to someone
 * whose realm role still names them is likewise an admin action.
 */
export const hasPulseAccessOidcRole = (oidcRoles: string[] = []): boolean =>
  oidcRoles.includes(pulseAccessOidcRole());
