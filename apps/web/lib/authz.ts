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

// Roles that run the shop: manage services, hours, overrides and the business profile.
export const MANAGER_ROLES = ["BUSINESS_OWNER", "ADMIN"] as const;
// Roles that can book appointments. Business owners manage the shop; they do not book.
export const CUSTOMER_ROLES = ["CUSTOMER", "ADMIN"] as const;
