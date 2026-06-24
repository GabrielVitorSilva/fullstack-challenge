import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { JwtVerifierService } from "./jwt-verifier.service";
import type { AuthenticatedUser } from "./authenticated-user";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtVerifier: JwtVerifierService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: AuthenticatedUser;
    }>();

    request.user = await this.jwtVerifier.verifyAuthorizationHeader(request.headers.authorization);
    return true;
  }
}
