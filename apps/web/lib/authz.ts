import type { Role } from "@booking/db";

// Pure authorization checks. No I/O, so they are unit-testable without a database.

export type SessionUser = { id: string; role: Role };

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function assertRole(user: SessionUser | null | undefined, allowed: readonly Role[]): SessionUser {
  if (!user) throw new HttpError(401, "Authentication required");
  if (!allowed.includes(user.role)) throw new HttpError(403, "Insufficient permissions");
  return user;
}

// ADMIN may manage any business; BUSINESS_OWNER only the business they own.
export function assertCanManageBusiness(user: SessionUser, business: { ownerId: string }): void {
  if (user.role === "ADMIN") return;
  if (business.ownerId !== user.id) throw new HttpError(403, "You do not own this business");
}
