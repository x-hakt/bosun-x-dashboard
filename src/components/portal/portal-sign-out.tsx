import { signOut } from "@/auth";

// Server component + inline server action — styled as the portal CTA button.
export function PortalSignOut() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <button type="submit" className="pt-cta">
        Sign out
      </button>
    </form>
  );
}
