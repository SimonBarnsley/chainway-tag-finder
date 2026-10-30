import { expect, it } from "vitest";
import { canAdministerCompany } from "./tenant-access";

it("rejects a company administrator targeting another customer", () => {
  expect(canAdministerCompany(["admin"], "company-a", "company-b", "aal2")).toBe(false);
});
it("allows an administrator within their own company", () => {
  expect(canAdministerCompany(["admin"], "company-a", "company-a", "aal2")).toBe(true);
});
it("requires two-step authentication for admins", () => {
  expect(canAdministerCompany(["admin"], "company-a", "company-a", "aal1")).toBe(false);
});
it("requires two-step authentication for super admins", () => {
  expect(canAdministerCompany(["super_admin"], "company-a", "company-b", "aal1")).toBe(false);
});
it("allows a verified super admin to administer other companies", () => {
  expect(canAdministerCompany(["super_admin"], "company-a", "company-b", "aal2")).toBe(true);
});
it("does not grant admin access to basic users", () => {
  expect(canAdministerCompany(["user"], "company-a", "company-a", "aal2")).toBe(false);
});
it("does not grant a tenant admin global access with an empty company", () => {
  expect(canAdministerCompany(["admin"], "company-a", "", "aal2")).toBe(false);
});