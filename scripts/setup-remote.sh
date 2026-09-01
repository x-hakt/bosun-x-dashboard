#!/usr/bin/env bash
# setup-remote.sh — mint a least-privilege discovery credential for one host.
#
# The dashboard's cross-host discovery reaches other machines over SSH to list their
# containers and read basic host stats. It must NOT use your normal SSH key. This
# script generates a dedicated keypair whose public half, once installed on the target,
# can ONLY run a fixed read-only command — no shell, no pty, no port-forwarding.
#
#   ./scripts/setup-remote.sh <host-id> [user@hostname]
#
#   <host-id>        the id you'll use in infra/hosts.yml and project.yml `host:`
#   [user@hostname]  where to reach it (for the printed ssh config block); optional
#
# It writes, under ./discovery-ssh/ by default (override with $OUT_DIR):
#   <host-id>            the private key        — mount this into the container
#   <host-id>.pub        the public key
#   <host-id>.command    the forced command script — copy to the TARGET host
#   <host-id>.authorized the exact authorized_keys line — paste on the TARGET host
#   ssh_config           appended: a Host block for this host-id
#
# Nothing is sent anywhere. You install the last two files on the target yourself.
set -euo pipefail

HOST_ID="${1:-}"
DEST="${2:-}"
OUT_DIR="${OUT_DIR:-./discovery-ssh}"
REMOTE_SCRIPT_PATH="${REMOTE_SCRIPT_PATH:-/usr/local/bin/bosun-discovery.sh}"
CONTAINER_KEY_DIR="${CONTAINER_KEY_DIR:-/config/ssh}"

if [ -z "$HOST_ID" ] || ! printf '%s' "$HOST_ID" | grep -qE '^[a-z0-9][a-z0-9-]*$'; then
  echo "usage: $0 <host-id> [user@hostname]   (host-id: lowercase, digits, dashes)" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
KEY="$OUT_DIR/$HOST_ID"

if [ -e "$KEY" ]; then
  echo "refusing to overwrite $KEY — remove it first if you mean to re-mint" >&2
  exit 1
fi

ssh-keygen -t ed25519 -N '' -C "bosun-discovery:$HOST_ID" -f "$KEY" >/dev/null
chmod 600 "$KEY"

# The forced command: a fixed, read-only sequence. Its output is section-tagged so the
# dashboard's one parser (src/lib/infra/remote.ts) reads it the same as the local host.
# Uses `docker`; if the target runs Podman, change the last two lines to `podman`.
cat > "$KEY.command" <<'SCRIPT'
#!/bin/sh
# bosun-x discovery — read-only. Installed by setup-remote.sh. Safe to inspect.
echo "===UNAME==="; uname -srm
echo "===NPROC==="; nproc
echo "===MEMINFO==="; free -b
echo "===DISK==="; df -B1 -P / | tail -1 | awk '{print $2, $3, $4, $5}'
echo "===LOAD==="; cat /proc/loadavg
echo "===DOCKER_PS==="; docker ps -a --format '{{json .}}'
echo "===DOCKER_STATS==="; docker stats --no-stream --format '{{json .}}' 2>/dev/null
SCRIPT
chmod +x "$KEY.command"

PUB="$(cat "$KEY.pub")"
printf 'command="%s",restrict %s\n' "$REMOTE_SCRIPT_PATH" "$PUB" > "$KEY.authorized"

HOSTNAME_LINE=""
[ -n "$DEST" ] && HOSTNAME_LINE="  HostName ${DEST#*@}
  User ${DEST%@*}
"
cat >> "$OUT_DIR/ssh_config" <<CFG
Host discovery-$HOST_ID
${HOSTNAME_LINE}  IdentityFile $CONTAINER_KEY_DIR/$HOST_ID
  IdentitiesOnly yes
  BatchMode yes
  StrictHostKeyChecking accept-new

CFG

cat <<DONE

  Minted discovery credential for "$HOST_ID".

  ON THE TARGET HOST ($HOST_ID):
    1. sudo install -m 0755 $KEY.command $REMOTE_SCRIPT_PATH
    2. append this line to that user's ~/.ssh/authorized_keys (additive — touch nothing else):

$(cat "$KEY.authorized")

    3. verify the lockdown from another machine:
         ssh -i $KEY -o IdentitiesOnly=yes ${DEST:-user@$HOST_ID} 'id'      # -> runs the script, not \`id\`
         ssh -i $KEY -o IdentitiesOnly=yes -tt ${DEST:-user@$HOST_ID}       # -> pty rejected

  ON THIS HOST (the dashboard):
    - mount $OUT_DIR read-only into the container at $CONTAINER_KEY_DIR
    - set config.yml:  ssh_config: $CONTAINER_KEY_DIR/ssh_config
    - add "$HOST_ID" to infra/hosts.yml with:  ssh_alias: discovery-$HOST_ID, live_monitored: true

  If a jump host is needed, add a ProxyJump to the Host block and, on the jump host,
  a matching authorized_keys line with permitopen="TARGET:22" instead of plain restrict.
DONE
