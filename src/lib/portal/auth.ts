// Portal auth. This file (with projection.ts) is the audited boundary — the
// eslint fence lets it import operator modules; nothing else under
// src/app/(portal) or src/lib/portal may.
//
// A portal deployment reuses whatever sign-in providers are configured (Google /
// GitHub / OIDC). The gate is different: an operator email gets in as
// `{kind:"operator"}` (sees every Gate-1 project in the portal); any other email
// must resolve to an invited client for THIS portal, or access is refused.

import { auth } from "@/auth";
import { isAllowedEmail } from "@/lib/auth-config";
import { clientForEmail, getPortal } from "@/lib/data/clients";
import { PORTAL_SLUG } from "./mode";
import type { PortalViewer } from "./projection";
import type { Portal } from "@/lib/types";

export async function getPortalViewer(): Promise<PortalViewer | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;
  if (await isAllowedEmail(email)) return { kind: "operator" };
  const client = await clientForEmail(PORTAL_SLUG, email);
  return client ? { kind: "client", slug: client.slug } : null;
}

export async function currentPortal(): Promise<Portal | undefined> {
  return getPortal(PORTAL_SLUG);
}

// Shared by the signIn callback in auth.ts and the layout guard.
export async function emailMayEnterPortal(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  if (await isAllowedEmail(email)) return true;
  return Boolean(await clientForEmail(PORTAL_SLUG, email));
}
