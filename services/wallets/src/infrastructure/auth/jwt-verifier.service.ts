import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AuthenticatedUser } from "./authenticated-user";

const DEFAULT_ISSUER = "http://localhost:8080/realms/crash-game";

@Injectable()
export class JwtVerifierService {
  private readonly issuer = process.env.OIDC_ISSUER ?? DEFAULT_ISSUER;
  private readonly jwksUri =
    process.env.OIDC_JWKS_URI ?? `${this.issuer}/protocol/openid-connect/certs`;
  private readonly jwks = createRemoteJWKSet(new URL(this.jwksUri));

  async verifyAuthorizationHeader(authorization?: string): Promise<AuthenticatedUser> {
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) throw new UnauthorizedException("Missing bearer token");

    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: this.issuer,
    }).catch(() => {
      throw new UnauthorizedException("Invalid bearer token");
    });

    if (!payload.sub) throw new UnauthorizedException("Token is missing sub");

    return {
      sub: payload.sub,
      preferredUsername:
        typeof payload.preferred_username === "string" ? payload.preferred_username : undefined,
      email: typeof payload.email === "string" ? payload.email : undefined,
    };
  }
}
