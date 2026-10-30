export function canAdministerCompany(roles: string[], callerCompany: string | null, targetCompany: string | null, aal: unknown): boolean {
  if (aal !== "aal2") return false;
  if (roles.includes("super_admin")) return true;
  return roles.includes("admin") && Boolean(callerCompany) && callerCompany === targetCompany;
}