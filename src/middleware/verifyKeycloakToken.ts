import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import https from "https";
import logger from "../config/logger.ts";
import CustomError from "../config/CustomError.ts";
import { AuthUser } from "../types/auth.ts";

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
export const verifyKeycloakToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader)
    throw new CustomError({
      statusCode: 401,
      message: "Missing Authorization header",
    });

  const token = authHeader.split(" ")[1];
  if (!token)
    throw new CustomError({
      statusCode: 401,
      message: "Missing token",
    });

  const decodedHeader = jwt.decode(token, { complete: true });
  if (!decodedHeader || typeof decodedHeader === "string") {
    throw new CustomError({
      statusCode: 401,
      message: "Invalid authorization header",
    });
  }

  const kid = decodedHeader.header.kid;
  const key = await jwkClient.getSigningKey(kid);
  const signingKey = key.getPublicKey();

  // decode and verify token
  try {
    // https://github.com/auth0/node-jsonwebtoken?tab=readme-ov-file#jwtverifytoken-secretorpublickey-options-callback
    // Returns the payload decoded if the signature is valid and optional expiration, audience, or issuer are valid. If not, it will throw the error.
    const decoded = jwt.verify(token, signingKey, {
      algorithms: ["RS256"],
    }) as jwt.JwtPayload;
    // attach user info to request.
    // Keycloak only provides identity claims at this stage; the rest of the
    // AuthUser is resolved from the database later in the request lifecycle,
    // and downstream consumers of this middleware only read sub/email.
    req.user = {
      sub: decoded.sub,
      email: decoded.email,
    } as AuthUser;
    next();
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError) {
      logger.warn(`User provided invalid token:  ${err}`);
    }
    if (err instanceof jwt.NotBeforeError) {
      logger.warn(`User provided not yet valid token:  ${err}`);
    }
    throw new CustomError({
      statusCode: 401,
      message: "Invalid or expired token",
    });
  }
};
