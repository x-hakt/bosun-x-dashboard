import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Dockerode pulls in ssh2's native/Node-specific crypto path. Keep it as a runtime
  // Node dependency instead of asking Turbopack to place that asset in an ESM chunk.
  serverExternalPackages: ["dockerode"],
  async redirects() {
    return [
      // /infra was the original route name before the Servers rename — redirect so
      // anything that already links there (bookmarks, the AI Handoff doc, external
      // notes) keeps working instead of 404ing.
      { source: "/infra", destination: "/servers", permanent: false },
      { source: "/infra/:host", destination: "/servers/:host", permanent: false },
    ];
  },
};

export default nextConfig;
