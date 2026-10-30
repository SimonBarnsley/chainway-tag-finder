export function findRegisteredCompany<T extends { name: string; slug: string }>(companies: T[], input: { companyName?: string; companySlug?: string }) {
  return companies.find((company) => input.companySlug
    ? company.slug === input.companySlug
    : company.name.trim().toLowerCase() === input.companyName?.trim().toLowerCase());
}

export function isAssignableUserRole(role: unknown): role is "admin" | "supervisor" | "user" {
  return role === "admin" || role === "supervisor" || role === "user";
}