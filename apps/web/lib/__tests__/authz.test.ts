import { describe, expect, it } from "vitest";
import { assertCanManageBusiness, assertRole, HttpError } from "../authz";

const owner = { id: "u-owner", role: "BUSINESS_OWNER" as const };
const otherOwner = { id: "u-other", role: "BUSINESS_OWNER" as const };
const customer = { id: "u-cust", role: "CUSTOMER" as const };
const admin = { id: "u-admin", role: "ADMIN" as const };

function statusOf(fn: () => unknown): number | null {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof HttpError ? err.status : -1;
  }
}

describe("assertRole", () => {
  it("returns 401 when there is no user", () => {
    expect(statusOf(() => assertRole(null, ["BUSINESS_OWNER"]))).toBe(401);
    expect(statusOf(() => assertRole(undefined, ["BUSINESS_OWNER"]))).toBe(401);
  });

  it("returns 403 when the role is not allowed", () => {
    expect(statusOf(() => assertRole(customer, ["BUSINESS_OWNER", "ADMIN"]))).toBe(403);
  });

  it("passes when the role is allowed", () => {
    expect(assertRole(owner, ["BUSINESS_OWNER", "ADMIN"])).toBe(owner);
    expect(assertRole(admin, ["ADMIN"])).toBe(admin);
  });
});

describe("assertCanManageBusiness", () => {
  const business = { ownerId: owner.id };

  it("allows the owning business owner", () => {
    expect(statusOf(() => assertCanManageBusiness(owner, business))).toBeNull();
  });

  it("forbids a different business owner", () => {
    expect(statusOf(() => assertCanManageBusiness(otherOwner, business))).toBe(403);
  });

  it("allows ADMIN on any business", () => {
    expect(statusOf(() => assertCanManageBusiness(admin, business))).toBeNull();
  });
});
