# recipes-api — spec

A personal recipe box with a public read-only view.

- REST API (Node) over a Postgres store of recipes, tags, and photos
- A small static frontend, served by nginx
- Write access behind the shared OIDC provider; read access is public
- Nightly Postgres dump to the NAS via the backup agent
