export interface AuthOrganization {
  id: number;
  name?: string;
}

/**
 * Authenticated user attached to the request by the auth middleware
 * (see `authenticateJWT`). Mirrors the claims encoded in the backend JWT.
 */
export interface AuthUser {
  id: number;
  sub: string;
  email: string;
  roles: string[];
  organization: AuthOrganization;
  administeredProjects: number[];
}
