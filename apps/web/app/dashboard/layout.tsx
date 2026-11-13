import { redirect } from "next/navigation";
import { MANAGER_ROLES } from "@/lib/authz";
import { getSessionUser } from "@/lib/session";

// Every /dashboard route is owner/admin only. Middleware is the first gate; this layout re-checks the
// session on the server so no page under /dashboard renders for anyone else.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?callbackUrl=/dashboard");
  if (!(MANAGER_ROLES as readonly string[]).includes(user.role)) redirect("/");
  return children;
}
