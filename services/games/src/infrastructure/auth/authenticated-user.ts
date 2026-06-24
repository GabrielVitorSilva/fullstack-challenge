export interface AuthenticatedUser {
  sub: string;
  preferredUsername?: string;
  email?: string;
}
