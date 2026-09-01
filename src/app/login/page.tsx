import { signIn } from "@/auth";
import { configuredProviders } from "@/lib/auth-config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// configuredProviders() reads process.env, which is only correct at request time —
// a statically prerendered login page bakes in whatever it was at build.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  const providers = configuredProviders();

  return (
    <div className="flex items-center justify-center h-full p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-base">
            <span className="text-muted-foreground">▸</span> bosun-x
          </CardTitle>
        </CardHeader>
        <CardContent>
          {providers.length > 0 ? (
            <div className="space-y-2">
              {providers.map((provider) => (
                <form
                  key={provider.id}
                  action={async () => {
                    "use server";
                    await signIn(provider.id, { redirectTo: "/" });
                  }}
                >
                  <Button type="submit" className="w-full">
                    Sign in with {provider.label}
                  </Button>
                </form>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No sign-in provider is configured — the dashboard is open. See docs/auth.md to add one.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
