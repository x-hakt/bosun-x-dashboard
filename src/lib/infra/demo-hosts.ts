// BXD-109: what the demo's sample hosts report, in place of the machine it runs on. The
// text is the same section-tagged shape the read-only snapshot script prints, so it goes
// through the real parser (parseSnapshot) and every page renders it exactly as it would a
// live host. Keyed "local" for the host the dashboard runs on (data.example's home-server)
// and by ssh_alias for the others. Container names match the sample projects'
// compose_service entries, so discovery and the project pages pair them up.

interface DemoContainer {
  name: string;
  image: string;
  project?: string; // compose project label; absent = an unlabelled container
  workdir?: string;
  status: string;
  cpu: string;
  mem: string;
  memPct: string;
  mounts?: string;
  traefik?: boolean;
}

interface DemoHost {
  kernel: string;
  cores: number;
  memTotal: number;
  memAvail: number;
  disk: [size: number, used: number];
  load: string;
  containers: DemoContainer[];
}

const GiB = 1024 ** 3;

function snapshotText(h: DemoHost): string {
  const memUsed = h.memTotal - h.memAvail;
  const [size, used] = h.disk;
  const ps = h.containers.map((c) =>
    JSON.stringify({
      Names: c.name,
      Image: c.image,
      State: c.status.startsWith("Up") ? "running" : "exited",
      Status: c.status,
      Labels: [
        c.project && `com.docker.compose.project=${c.project}`,
        c.project && `com.docker.compose.service=${c.name}`,
        c.project && c.workdir && `com.docker.compose.project.working_dir=${c.workdir}`,
        c.traefik && "traefik.enable=true",
      ].filter(Boolean).join(","),
      Mounts: c.mounts ?? "",
    }),
  );
  const stats = h.containers
    .filter((c) => c.status.startsWith("Up"))
    .map((c) => JSON.stringify({ Name: c.name, CPUPerc: c.cpu, MemUsage: c.mem, MemPerc: c.memPct }));
  return [
    "===UNAME===", h.kernel,
    "===NPROC===", String(h.cores),
    "===MEMINFO===",
    "               total        used        free      shared  buff/cache   available",
    `Mem:    ${h.memTotal} ${memUsed} ${Math.round(h.memAvail * 0.4)} 0 ${Math.round(h.memAvail * 0.6)} ${h.memAvail}`,
    "===DISK===", `${size} ${used} ${size - used} ${Math.round((used / size) * 100)}%`,
    "===LOAD===", `${h.load} 1/412 23117`,
    "===DOCKER_PS===", ...ps,
    "===DOCKER_STATS===", ...stats,
    "",
  ].join("\n");
}

const HOSTS: Record<string, DemoHost> = {
  local: {
    kernel: "Linux 6.8.0-45-generic x86_64",
    cores: 8,
    memTotal: 16 * GiB,
    memAvail: 9.6 * GiB,
    disk: [930 * GiB, 412 * GiB],
    load: "0.61 0.54 0.49",
    containers: [
      { name: "blog", image: "ghost:5-alpine", project: "blog", workdir: "/home/dev/stacks/blog", status: "Up 6 days (healthy)", cpu: "0.21%", mem: "212.4MiB / 15.6GiB", memPct: "1.33%", mounts: "blog_content", traefik: true },
      { name: "dashboard", image: "bosun-x-dashboard:latest", project: "dashboard", workdir: "/home/dev/stacks/dashboard", status: "Up 2 days (healthy)", cpu: "0.64%", mem: "148.9MiB / 15.6GiB", memPct: "0.93%", mounts: "/home/dev/bosun-x-data", traefik: true },
      { name: "photo-vault", image: "photoprism/photoprism:latest", project: "photo-vault", workdir: "/home/dev/stacks/photo-vault", status: "Up 6 days", cpu: "3.12%", mem: "1.21GiB / 15.6GiB", memPct: "7.76%", mounts: "/srv/photos,photo-vault_storage" },
    ],
  },
  "discovery-vps": {
    kernel: "Linux 6.1.0-25-cloud-amd64 x86_64",
    cores: 2,
    memTotal: 4 * GiB,
    memAvail: 1.7 * GiB,
    disk: [80 * GiB, 31 * GiB],
    load: "0.18 0.22 0.20",
    containers: [
      { name: "recipes-api", image: "recipes-api:1.4.2", project: "recipes-api", workdir: "/opt/recipes-api", status: "Up 11 days (healthy)", cpu: "0.35%", mem: "96.1MiB / 3.8GiB", memPct: "2.47%" },
      { name: "recipes-api-web", image: "nginx:1.27-alpine", status: "Up 11 days", cpu: "0.02%", mem: "8.4MiB / 3.8GiB", memPct: "0.22%", traefik: true },
      { name: "recipes-api-postgres", image: "postgres:16-alpine", status: "Up 11 days (healthy)", cpu: "0.41%", mem: "71.3MiB / 3.8GiB", memPct: "1.83%", mounts: "recipes_pgdata" },
      { name: "link-shelf-web", image: "link-shelf:0.9.0", project: "link-shelf", workdir: "/opt/link-shelf", status: "Exited (0) 3 weeks ago", cpu: "0%", mem: "0B / 0B", memPct: "0%" },
      { name: "link-shelf-db", image: "postgres:16-alpine", project: "link-shelf", workdir: "/opt/link-shelf", status: "Exited (0) 3 weeks ago", cpu: "0%", mem: "0B / 0B", memPct: "0%", mounts: "link-shelf_pgdata" },
      { name: "uptime-kuma", image: "louislam/uptime-kuma:1", project: "uptime", workdir: "/opt/uptime", status: "Up 11 days (healthy)", cpu: "0.88%", mem: "118.7MiB / 3.8GiB", memPct: "3.05%", mounts: "uptime_data", traefik: true },
    ],
  },
};

/** Snapshot text for a demo host ("local" or an ssh_alias), or null if it has none. */
export function demoSnapshotText(key: string): string | null {
  const host = HOSTS[key];
  return host ? snapshotText(host) : null;
}
