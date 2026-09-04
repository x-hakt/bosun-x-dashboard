import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  // ── Client-portal isolation fence (CGB-2.1) ────────────────────────────────
  // The portal renders a per-client projection of the shared data store. Portal
  // code must reach data ONLY through src/lib/portal/projection.ts (and auth via
  // src/lib/portal/auth.ts) — never by importing an operator data/action/infra
  // module directly, which would bypass the two share gates. The excluded files
  // below are the audited boundary; adding one is a deliberate review step.
  {
    files: ["src/lib/portal/**/*.{ts,tsx}", "src/app/(portal)/**/*.{ts,tsx}"],
    ignores: ["src/lib/portal/projection.ts", "src/lib/portal/auth.ts", "src/lib/portal/reply.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/lib/data",
                "@/lib/data/*",
                "@/lib/actions",
                "@/lib/actions/*",
                "@/lib/infra",
                "@/lib/infra/*",
                "@/lib/checks",
                "@/lib/checks/*",
              ],
              message:
                "Portal code must go through @/lib/portal/projection.ts (or auth.ts) — importing an operator data/action module here bypasses the CGB-2.1 share gates.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
