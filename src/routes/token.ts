import { Router } from "express";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import https from "https";

import { User, Organization, Notification, ProjectUser } from "models/index";
import * as userService from "services/user.service";
import logger from "config/logger";
import { logToDatabase } from "utils/index";

const tokenRouter = Router();

// Shape of the Keycloak-issued token payload consumed here.
interface KeycloakToken extends jwt.JwtPayload {
  sub: string;
  email: string;
  name?: string;
  realm_access: { roles: string[] };
}

const httpsAgent = new https.Agent({
  rejectUnauthorized: false, // Accept self-signed cert for test server
});

const jwkClient = jwksClient({
  jwksUri: `${process.env.KEYCLOAK_BASE_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/certs`,
  requestAgent: httpsAgent, // enables the self-signed support for development server
});

/**
 * Verify if token is valid
 * @param token token provided by user
 * @returns decoded token
 * @throws error if token is invalid
 */
const verifyKeycloakToken = async (token: string): Promise<KeycloakToken> => {
  const decodedHeader = jwt.decode(token, { complete: true });
  if (!decodedHeader || typeof decodedHeader === "string") {
    throw new Error("Invalid token header");
  }

  const kid = decodedHeader.header.kid;
  const key = await jwkClient.getSigningKey(kid);
  const signingKey = key.getPublicKey();

  const verified = jwt.verify(token, signingKey, { algorithms: ["RS256"] });
  if (typeof verified === "string") {
    throw new Error("Invalid token payload");
  }
  return verified as KeycloakToken;
};

/**
 *
 * @param decoded the user info from token
 * @param user the user info from database
 * @returns roles for user
 */
async function getRolesForUser(decoded: KeycloakToken, user: User) {
  logger.debug("getRolesForUser Decoded: ", decoded);

  const roles = [];

  // if user is set as platform admin in keycload, return directly admin role

  console.log("User: ", user);

  // concatenate roles from DB user info
  // logger.debug("platformRoles: ", user.platformRoles);
  // logger.debug("rolesInOrganizations: ", user.rolesInOrganizations);
  // logger.debug("projectRoles: ", user.projectRoles);

  // roles = roles.concat(
  //   user.platformRoles,
  //   user.rolesInOrganizations,
  //   user.projectRoles,
  // );

  // just use role name
  // roles = roles.map((role) => {
  //   if (role) return role.name;
  //   return "";
  // });

  // add roles from keycloak
  if (decoded.realm_access.roles.includes("platform-admin")) {
    roles.push("admin", "impersonator");
  }

  if (decoded.realm_access.roles.includes("platform-ro-admin")) {
    roles.push("readOnlyAdmin");
  }

  if (user.organization_manager) {
    roles.push("organization-manager");
  }

  if (user.organization_auditor) {
    roles.push("organization-auditor");
  }

  const userAdminOfProjects = await ProjectUser.findAll({
    where: { user_id: user.id, admin: true },
  });
  console.log("ProjectUsers: ", userAdminOfProjects);

  if (userAdminOfProjects.length > 0) {
    roles.push("project-admin");
  }

  // remove undefine
  return roles.filter((role) => role.length);
}

async function getUserOrganization(decoded: KeycloakToken) {
  // first search user by sub (that is not initially set)
  const user = await User.findOne({
    where: {
      email: decoded.email,
    },
    include: [
      {
        model: Organization,
        attributes: ["id", "name"],
      },
    ],
  });
  logger.debug("User: ", user);
  return user ? user.getOrganization() : null;
}

/**
 * Get user information from database
 * @param decoded the decoded token
 * @returns user info
 */
// TODO: refactor to avoid side effects (extract DB updates in dedicated functions)
async function getUserInformation(decoded: KeycloakToken) {
  // first search user by sub (that is not initially set)
  let user = await User.findOne({
    where: {
      sub: decoded.sub,
    },
    include: [
      {
        model: Organization,
        attributes: ["id", "name", "reference_organization_id"],
      },
      // {
      //   model: Role,
      //   as: 'rolesInOrganizations',
      //   through: {
      //     attributes: ['organization_id'],
      //   },
      // },
      // {
      //   model: Role,
      //   as: 'projectRoles',
      //   through: { attributes: [] },
      //   attributes: ['name'],
      // },
      // {
      //   model: Role,
      //   as: 'platformRoles',
      //   through: { attributes: [] },
      //   attributes: ['name'],
      // },
      //{ model: Role, as: 'projectRoles' },
    ],
  });

  logger.debug(`User (by sub): ${user}`);
  //console.log("OrgRoles: ", JSON.stringify(user.rolesInOrganizations))

  // if sub is not set, search by email and then set sub
  if (!user) {
    user = await User.findOne({
      where: {
        email: decoded.email,
      },
      include: [
        {
          model: Organization,
          attributes: ["id", "name"],
        },
        // {
        //   model: Role,
        //   as: 'rolesInOrganizations',
        //   through: {
        //     attributes: ['organization_id'],
        //   },
        // },
        // {
        //   model: Role,
        //   as: 'projectRoles',
        //   through: { attributes: [] },
        //   attributes: ['name'],
        // },
        // {
        //   model: Role,
        //   as: 'platformRoles',
        //   through: { attributes: [] },
        //   attributes: ['name'],
        // },
      ],
    });
    logger.debug("User (by email): ", user);

    // update user with sub
    if (user) {
      logger.info(`Updating user with SUB (${decoded.sub})`);
      user.sub = decoded.sub;
      await user.save();
      logToDatabase({
        userId: user.id,
        action: "update",
        resource: "users",
        resourceId: user.id,
        description: `user ${user.email} automatically updated with sub: ${user.sub}`,
      });
      //await log.save()
    } else {
      // if user is not found in database, add it
      logger.info(`Adding new user to database (${decoded.email}))`);
      // The realm role seeds Pulse (sweep) access for a brand-new identity, so
      // the gateway's /userRoles lookup grants HPC principals what the realm
      // already gives them. Only at registration: afterwards the flag is the
      // platform's, so an admin's revocation survives the next login.
      const pulla_user = userService.hasPulseAccessOidcRole(
        decoded.realm_access?.roles ?? [],
      );
      user = await User.create({
        email: decoded.email,
        sub: decoded.sub,
        pulla_user,
      });
      //await user.save()
      logToDatabase({
        userId: user.id,
        action: "registration",
        resource: "users",
        resourceId: user.id,
        description: `user ${user.email} (${user.sub}) automatically inserted into database${pulla_user ? ` with Pulse access from identity-provider role '${userService.pulseAccessOidcRole()}'` : ""}`,
      });
      //await log.save()
    }
  }

  return user;
}

/**
 * Verify if keycloak authentication token is present and valid and respond with a platform authentication token
 */
tokenRouter.post("/", async (req, res) => {
  logger.silly("User posted to token");
  try {
    logger.silly(`Auth Headers: ${JSON.stringify(req.headers.authorization)}`);
    const token = req.headers.authorization?.split(" ")[1];

    // verify if authentication token was provided in request header
    if (!token) {
      logger.debug("Missing token!");
      throw new Error("Missing token");
    } else {
      logger.silly(`Token: ${token}`);
    }

    // https://github.com/auth0/node-jsonwebtoken?tab=readme-ov-file#jwtverifytoken-secretorpublickey-options-callback
    // Returns the payload decoded if the signature is valid and optional expiration, audience, or issuer are valid. If not, it will throw the error.
    const decoded = await verifyKeycloakToken(token);

    logger.debug(`Decoded token: ${JSON.stringify(decoded)}`);

    // get user information from database
    const user = await getUserInformation(decoded);
    logger.debug("User gotten from DB: ", user);

    // get roles from user, if any
    const roles = await getRolesForUser(decoded, user);
    logger.debug("Roles: ", roles);

    let administeredProjects: number[] = [];

    if (roles.includes("project-admin")) {
      const ids = await ProjectUser.findAll({
        where: { user_id: user.id, admin: true },
        attributes: ["project_id"],
        raw: true,
      });
      administeredProjects = ids.map((el) => el.project_id);
      console.log("administeredProjects: ", administeredProjects);
    }

    // Generate backend JWT
    const backendToken = jwt.sign(
      {
        id: user.id,
        sub: decoded.sub,
        email: decoded.email,
        name: decoded.name || null,
        roles: roles,
        organization: user.organization,
        administeredProjects,
      },
      process.env.BACKEND_SECRET!,
      // jsonwebtoken types expiresIn as a `ms` StringValue template; the env
      // value is a plain string, so a cast is required here.
      {
        expiresIn: (process.env.TOKEN_DURATION ||
          "24h") as jwt.SignOptions["expiresIn"],
      },
    );

    await Notification.create({
      //timestamp: new Date(),
      user_id: user.id,
      read: false,
      title: "login",
      description: `user ${user.email} (${user.sub}) log-in`,
    });

    logToDatabase({
      userId: user.id,
      action: "login",
      resource: "users",
      resourceId: user.id,
      description: `user ${user.email} (${user.sub}) log-in`,
    });

    res.json({ token: backendToken });
    return;
  } catch (err) {
    logger.debug(err);
    res.status(401).json({ message: "Missing or Invalid token" });
    return;
  }
});

export default tokenRouter;
