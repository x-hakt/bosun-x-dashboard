import Docker from "dockerode";
import { cached } from "@/lib/util/ttl-cache";

export interface ContainerSummary {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  health?: string;
  composeProject?: string;
  composeService?: string;
  composeWorkingDir?: string;
}

let client: Docker | null = null;
function getClient(): Docker {
  if (!client) {
    // DOCKER_HOST wins when set (dockerode parses tcp:// and unix:// itself) — this is
    // how you point at a Podman socket: DOCKER_HOST=unix:///run/podman/podman.sock
    // (mount that path into the container). Otherwise the default Docker socket.
    client = process.env.DOCKER_HOST ? new Docker() : new Docker({ socketPath: "/var/run/docker.sock" });
  }
  return client;
}

// Short TTL: the layout, the detail page, and discovery each call this independently
// on a single navigation — this keeps them from tripling the Docker API round-trips
// without making container state feel stale (an ops dashboard genuinely wants ~live).
export async function listContainers(): Promise<ContainerSummary[]> {
  return cached("docker:local", 5_000, fetchContainers);
}

async function fetchContainers(): Promise<ContainerSummary[]> {
  const docker = getClient();
  const containers = await docker.listContainers({ all: true });
  return containers.map((c) => {
    // Docker's `Status` string reuses the same "(...)" shape for two different things:
    // "Up X (healthy)" is a real healthcheck result, but "Exited (0) X ago" is an exit
    // code — only running containers' parenthetical is ever a health status.
    const healthMatch = c.State === "running" ? /\(([^)]+)\)/.exec(c.Status) : null;
    const health = healthMatch && /healthy|starting/i.test(healthMatch[1]) ? healthMatch[1] : undefined;
    const labels = c.Labels ?? {};
    return {
      id: c.Id.slice(0, 12),
      name: c.Names?.[0]?.replace(/^\//, "") ?? c.Id.slice(0, 12),
      image: c.Image,
      state: c.State,
      status: c.Status,
      health,
      composeProject: labels["com.docker.compose.project"] ?? labels["io.podman.compose.project"],
      composeService: labels["com.docker.compose.service"] ?? labels["io.podman.compose.service"],
      composeWorkingDir: labels["com.docker.compose.project.working_dir"],
    };
  });
}
