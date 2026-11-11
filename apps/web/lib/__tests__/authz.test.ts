import { describe, expect, it } from "vitest";
import { assertRole, CUSTOMER_ROLES, HttpError, MANAGER_ROLES } from "../authz";

const owner = { id: "u-owner", role: "BUSINESS_OWNER" as const };
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

describe("role groups", () => {
  it("lets owners and admins manage the shop, but not customers", () => {
    expect(assertRole(owner, MANAGER_ROLES)).toBe(owner);
    expect(assertRole(admin, MANAGER_ROLES)).toBe(admin);
    expect(statusOf(() => assertRole(customer, MANAGER_ROLES))).toBe(403);
  });

  it("lets customers and admins book, but not the business owner", () => {
    expect(assertRole(customer, CUSTOMER_ROLES)).toBe(customer);
    expect(assertRole(admin, CUSTOMER_ROLES)).toBe(admin);
    expect(statusOf(() => assertRole(owner, CUSTOMER_ROLES))).toBe(403);
  });
});
