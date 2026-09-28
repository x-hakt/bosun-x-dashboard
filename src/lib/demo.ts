// BXD-109: `npx bosun-x-dashboard --demo` runs on the sample data in data.example/. In demo
// mode nothing may read the machine the demo happens to run on: no Docker socket, no host
// stats, no SSH, no project folders, no git. Before this, the demo's "home-server" page
// listed the real host's containers and resources, so a screenshot of the demo leaked the
// setup of whoever took it. The launcher sets BOSUN_DEMO=1; every live source checks here
// and serves the sample snapshots in lib/infra/demo-hosts.ts instead.
export function isDemo(): boolean {
  return process.env.BOSUN_DEMO === "1";
}
