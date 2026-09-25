# Capacity

The **Capacity** section on the Servers page answers one question: will this project
fit on that server? Each live-monitored server (workstations are left out) gets three
bars, each the size of the whole machine:

- **RAM**, the primary one, split into the projects using it, then unregistered
  containers, shared containers (running but not part of any project), the host's own
  non-Docker use, and free space.
- **CPU**, in cores. The host total comes from the load average, so treat it as an
  estimate.
- **Disk**, split by project once the daily disk measurement has run (see below).

A dashed line marks the 80% comfort limit. Hover a segment for its figures; the legend
under each bar links each project to its page.

## Typical and peak, not a single moment

A single reading lies about spiky services. The **capacity sampler** records every
server every 5 minutes and keeps 14 days. Once at least 24 hours of history exists,
the RAM and CPU bars switch from the live snapshot to each project's **p95** (a typical
busy moment) over the window. Hover shows now, p95 and peak; a `↑` in the legend marks a
peak well above p95. Summed p95s run a little higher than any single moment, which is
the conservative direction for a "will it fit" question.

Containers are recorded by name and mapped to projects when the page renders, using
the same discovery as everywhere else, so a container that joins a project later is
counted under it for its whole history.

## Move simulator

Under the bars: pick a running project and a target server. The simulator moves the
project's share (p95 when there is history, otherwise live) onto the target without
rescaling anything, and gives a verdict:

- **fits**: RAM (and disk, when measured) stay under 80%
- **tight**: over 80%
- **doesn't fit**: over 100%, with the shortfall

CPU is shown but only advises, since it's a load-average estimate. The simulator also
warns about database containers, named volumes, writable bind mounts, Traefik routing
labels and a CPU architecture change, all of which make a move more than a
`docker compose up` somewhere else. It runs in the browser and changes nothing.

## Disk per project

A daily measurement splits each disk bar by project:

- the **unique layers** of each project's images (split evenly when projects share an
  image; base layers shared between images are not attributed),
- each container's **writable layer**,
- its **named volumes** (split when shared),
- its **writable bind-mount folders** on the root filesystem (`du`, at low priority;
  folders the measuring user can't read count low, and a folder nested inside another
  measured one is counted once).

Images and volumes no container uses show as **Unused images & volumes**
(reclaimable). Everything else on the disk (shared layers, build cache, the OS, other
files) is **other**.

**No secrets are read.** Container commands, labels and environment variables can hold
credentials, so every Docker query selects exact fields (names, ids, sizes, mount
types and paths) with a Go template. Nothing else leaves Docker, locally or over SSH.

## Setup

Both jobs are one script, run by cron on the host the dashboard runs on (Linux only:
it needs bash, `flock` and GNU coreutils). They write to
`<backup_receipts>/_capacity/` (see [configuration](configuration.md)), which the
dashboard reads, and both report as scheduled jobs on the Backups page so a stopped
sampler is visible.

```cron
# every 5 minutes: RAM/CPU history (14 days kept)
*/5 * * * * . /path/to/env; /path/to/bosun-x-dashboard/scripts/capacity-sample.sh >> /path/to/logs/capacity-sample.log 2>&1
# daily: per-project disk (15 days of files kept)
50 4 * * * . /path/to/env; /path/to/bosun-x-dashboard/scripts/capacity-sample.sh --disk >> /path/to/logs/capacity-sample.log 2>&1
```

The env file only needs `BACKUP_RECEIPTS` (and `BOSUN_DATA` if the data directory
isn't a sibling of the app checkout). Remote servers are reached with the discovery key
from `config.yml` `ssh_config`, the same read-only credential discovery uses.

### Remote servers

The RAM/CPU sampler needs nothing new on a remote host: it uses the existing forced
read-only command. The disk measurement asks that command for exactly `bosun-x-disk`.
Hosts set up with a current `scripts/setup-remote.sh` already answer it. For a host
set up earlier, copy the `bosun-x-disk` block from the `.command` file that
`setup-remote.sh` generates into the host's forced-command script, before any other
branch. Any other requested command still gets the normal read-only snapshot (or is
rejected, if your script has allowlists), so the lockdown is unchanged. Verify:

```bash
ssh -F <ssh_config> <alias> bosun-x-disk | head    # ===DISK=== ... ===END===
ssh -F <ssh_config> <alias> id                       # still the snapshot, not `id`
```
