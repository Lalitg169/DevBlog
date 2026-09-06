#!/usr/bin/env bash
# Runs a throwaway Postgres for local development without Docker or root.
# The cluster lives under the user's data directory, listens on 5433, and is
# entirely separate from any system Postgres on 5432.
#
#   ./scripts/dev-db.sh start | stop | status | psql | destroy

set -euo pipefail

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PGDATA="${PGDATA:-$HOME/.local/share/devblog-pg}"
PORT="${PGPORT:-5433}"
URL="postgres://devblog:devblog@localhost:${PORT}/devblog"

if [ ! -x "$PGBIN/pg_ctl" ]; then
    echo "Postgres binaries not found. Set PGBIN, or install postgresql." >&2
    exit 1
fi

init() {
    [ -d "$PGDATA" ] && return
    local pwfile
    pwfile=$(mktemp)
    printf 'devblog' > "$pwfile"
    "$PGBIN/initdb" -D "$PGDATA" -U devblog \
        --auth-local=trust --auth-host=scram-sha-256 --pwfile="$pwfile" > /dev/null
    rm -f "$pwfile"
    echo "Initialised cluster at $PGDATA"
}

case "${1:-start}" in
    start)
        init
        if "$PGBIN/pg_isready" -h localhost -p "$PORT" -q 2>/dev/null; then
            echo "Already running on port $PORT"
        else
            "$PGBIN/pg_ctl" -D "$PGDATA" \
                -o "-p $PORT -c listen_addresses=localhost -k $PGDATA" \
                -l "$PGDATA/server.log" start
        fi
        createdb -h localhost -p "$PORT" -U devblog devblog 2>/dev/null \
            && psql "$URL" -q -f "$(dirname "$0")/../server/schema.sql" \
            && echo "Created database and applied schema." \
            || echo "Database already present."
        echo "DATABASE_URL=$URL"
        ;;
    stop)    "$PGBIN/pg_ctl" -D "$PGDATA" stop ;;
    status)  "$PGBIN/pg_isready" -h localhost -p "$PORT" ;;
    psql)    psql "$URL" ;;
    destroy)
        "$PGBIN/pg_ctl" -D "$PGDATA" stop 2>/dev/null || true
        rm -rf "$PGDATA"
        echo "Removed $PGDATA"
        ;;
    *) echo "usage: $0 {start|stop|status|psql|destroy}" >&2; exit 1 ;;
esac
