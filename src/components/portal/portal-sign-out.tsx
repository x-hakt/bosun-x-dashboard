import { signOut } from "@/auth";

// Server component + inline server action — no client JS, no SessionProvider.
export function PortalSignOut() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <button type="submit" className="text-[var(--portal-ink)]/70 hover:text-[var(--portal-ink)]">
        Sign out
      </button>
    </form>
  );
}
