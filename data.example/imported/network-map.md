# Network map

A hand-maintained reference for the hosts the dashboard watches. Free-text — the
dashboard just renders it. (The live host list is `infra/hosts.yml`.)

## home-server

| | |
|---|---|
| mesh | 10.20.0.1 |
| lan  | 192.168.10.5 |
| ssh  | direct on the LAN |

Runs the dashboard, a blog, a photo library, and the NAS SMB mount. Docker +
Traefik for TLS. Mini PC, 16 GB RAM.

## cloud-vps

| | |
|---|---|
| public | 203.0.113.10 |
| mesh   | 10.20.0.2 |
| ssh    | `ssh discovery-vps` (mesh only, least-privilege key) |

A small cloud VM for anything that needs a public address — a recipes API and a
status page. Docker + Traefik.

## laptop

| | |
|---|---|
| mesh | 10.20.0.3 |

Workstation. Joins the mesh as a client to reach the two servers; nothing is
hosted on it.
