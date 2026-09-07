# archive-index.sh — BXD-41.
#
# The dashboard host can't see the backup destination (the NAS isn't mounted
# into the container), so LiveRestorePanel could only ever offer "latest". This
# writes an index of what's actually on the destination, next to the receipts
# the dashboard already reads:
#
#   $BACKUP_RECEIPTS/<slug>/<store>.archives.json
#   [ { name, taken_at, bytes, sha256, kind }, … ]   newest first
#
# kind is "backup" | "encrypted" | "pre-restore". `taken_at` comes from the
# YYYYMMDDTHHMMSSZ stamp in the filename (mtime as a fallback). sha256 is
# carried forward from the previous index or the archive just written — never
# recomputed for every file on every run (some are multi-GB).
#
#   write_archive_index <slug> <store> <out_dir> [new_archive_basename] [new_sha256]

write_archive_index() {
  local slug=$1 store=$2 out_dir=$3 new_name=${4:-} new_sha=${5:-}
  local index="${BACKUP_RECEIPTS:-$HOME/backup-receipts}/$slug/$store.archives.json"
  python3 - "$out_dir" "$store" "$index" "$new_name" "$new_sha" <<'PY' 2>/dev/null || true
import sys, os, json, re, glob, datetime

out_dir, store, index, new_name, new_sha = sys.argv[1:6]

prev = {}
try:
    for a in json.load(open(index)):
        if a.get("sha256"):
            prev[a["name"]] = a["sha256"]
except Exception:
    pass
if new_name and new_sha:
    prev[new_name] = new_sha

stamp = re.compile(r"(\d{8})T(\d{6})Z")
rows = []
for p in glob.glob(os.path.join(out_dir, glob.escape(store) + "-*")):
    name = os.path.basename(p)
    if name.endswith(".partial") or not os.path.isfile(p):
        continue
    try:
        size = os.path.getsize(p)
        mtime = os.path.getmtime(p)
    except OSError:
        continue
    m = stamp.search(name)
    if m:
        d, t = m.group(1), m.group(2)
        taken = f"{d[0:4]}-{d[4:6]}-{d[6:8]}T{t[0:2]}:{t[2:4]}:{t[4:6]}Z"
    else:
        taken = datetime.datetime.utcfromtimestamp(mtime).strftime("%Y-%m-%dT%H:%M:%SZ")
    if "-pre-restore-" in name:
        kind = "pre-restore"
    elif name.endswith(".age"):
        kind = "encrypted"
    else:
        kind = "backup"
    rows.append({"name": name, "taken_at": taken, "bytes": size, "sha256": prev.get(name), "kind": kind})

rows.sort(key=lambda r: r["taken_at"], reverse=True)
os.makedirs(os.path.dirname(index), exist_ok=True)
tmp = f"{index}.tmp.{os.getpid()}"
with open(tmp, "w") as f:
    json.dump(rows, f)
os.replace(tmp, index)
PY
}
