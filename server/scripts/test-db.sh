#!/bin/sh
set -e
cd "$(dirname "$0")/.."

PG_BIN="${PG_BIN:-$(brew --prefix postgresql@18 2>/dev/null)/bin}"
DATA_DIR=".pgtest"
PORT="${TEST_DB_PORT:-54329}"
DB_NAME="financare_test"

case "$1" in
  start)
    if [ ! -d "$DATA_DIR" ]; then
      "$PG_BIN/initdb" -D "$DATA_DIR" -U postgres --auth=trust -E UTF8 --no-locale >/dev/null
    fi
    if ! "$PG_BIN/pg_isready" -q -h localhost -p "$PORT"; then
      "$PG_BIN/pg_ctl" -D "$DATA_DIR" -l "$DATA_DIR/server.log" -w \
        -o "-p $PORT -k /tmp -c listen_addresses=localhost -c fsync=off -c synchronous_commit=off -c full_page_writes=off -c max_connections=50" \
        start >/dev/null
    fi
    if ! "$PG_BIN/psql" -h localhost -p "$PORT" -U postgres -Atc "select 1 from pg_database where datname = '$DB_NAME'" postgres | grep -q 1; then
      "$PG_BIN/createdb" -h localhost -p "$PORT" -U postgres "$DB_NAME"
    fi
    echo "test database ready: postgresql://postgres@localhost:$PORT/$DB_NAME"
    ;;
  stop)
    "$PG_BIN/pg_ctl" -D "$DATA_DIR" -m fast stop >/dev/null 2>&1 || true
    echo "test database stopped"
    ;;
  reset)
    "$0" stop
    rm -rf "$DATA_DIR"
    "$0" start
    ;;
  *)
    echo "usage: sh scripts/test-db.sh start|stop|reset"
    exit 1
    ;;
esac
