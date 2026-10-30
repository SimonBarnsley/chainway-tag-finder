import { expect, it } from "vitest";
import { findRegisteredCompany, isAssignableUserRole } from "./company-registration";
const companies = [{ name: "Levata", slug: "levata" }];
it("matches registered company names exactly without case sensitivity", () => {
  expect(findRegisteredCompany(companies, { companyName: "LEVATA" })?.slug).toBe("levata");
});
it("does not interpret percent as a company-name wildcard", () => {
  expect(findRegisteredCompany(companies, { companyName: "%" })).toBeUndefined();
});
it("does not interpret underscore as a company-name wildcard", () => {
  expect(findRegisteredCompany(companies, { companyName: "Levat_" })).toBeUndefined();
});
it("does not accept an unregistered company", () => {
  expect(findRegisteredCompany(companies, { companyName: "Unknown" })).toBeUndefined();
});
it("does not allow user creation to assign super-admin through a forged payload", () => {
  expect(isAssignableUserRole("super_admin")).toBe(false);
});