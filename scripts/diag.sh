#!/usr/bin/env bash
# Where does a local run spend its time? Records, next to the results:
#   diag/containers.csv  CPU and memory of the app and the database every 2s,
#                        plus how many database connections were busy
#   diag/queries.md      the slowest queries by total time (pg_stat_statements)
#
# Usage: scripts/diag.sh start   (after seeding, before the run)
#        scripts/diag.sh stop    (after the run)
#        (sample is the background loop that start launches)
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p diag
psql() { docker compose exec -T db psql -U finance -d finance -qAt "$@"; }

case "${1:-}" in
  start)
    psql -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements"
    # The seed's own queries would drown out the run's
    psql -c "SELECT pg_stat_statements_reset()" > /dev/null
    echo "time,container,cpu_pct,mem,db_active,db_waiting" > diag/containers.csv
    # setsid: the sampler must outlive this CI step and run through the next
    setsid "$0" sample > /dev/null 2>&1 &
    echo $! > diag/sampler.pid
    ;;
  sample)
    # One failed sample (e.g. a busy database) must not end the sampling
    set +e
    while true; do
      now=$(date +%s)
      conns=$(psql -F, -c "SELECT count(*) FILTER (WHERE state = 'active'),
          count(*) FILTER (WHERE wait_event_type IN ('Lock', 'LWLock'))
        FROM pg_stat_activity WHERE datname = 'finance' AND pid <> pg_backend_pid()")
      docker stats --no-stream --format '{{.Name}},{{.CPUPerc}},{{.MemUsage}}' |
        sed "s|^|$now,|; s|%||; s|\$|,$conns|" >> diag/containers.csv
      sleep 2
    done
    ;;
  stop)
    kill "$(cat diag/sampler.pid)" 2> /dev/null || true
    rm -f diag/sampler.pid
    {
      echo "### Slowest queries (by total time)"
      echo
      echo "| Calls | Mean ms | Total s | Rows | Query |"
      echo "| --- | --- | --- | --- | --- |"
      psql -F' | ' -c "SELECT calls, round(mean_exec_time::numeric, 2),
          round((total_exec_time / 1000)::numeric, 1), rows,
          left(regexp_replace(query, '\s+', ' ', 'g'), 160)
        FROM pg_stat_statements
        WHERE query NOT ILIKE '%pg_stat%'
        ORDER BY total_exec_time DESC LIMIT 15" |
        sed 's/^/| /; s/$/ |/'
    } > diag/queries.md
    # Average and peak per container; 100% is one full CPU
    {
      echo "### Containers during the run"
      echo
      echo "| Container | Avg CPU % | Peak CPU % |"
      echo "| --- | --- | --- |"
      awk -F, 'NR > 1 && $2 ~ /(app|db)/ {
          n[$2]++; sum[$2] += $3; if ($3 > peak[$2]) peak[$2] = $3
        }
        END { for (c in n) printf "| %s | %.0f | %.0f |\n", c, sum[c] / n[c], peak[c] }' \
        diag/containers.csv | sort
      echo
      awk -F, 'NR > 1 { if ($5 > act) act = $5; if ($6 > wait) wait = $6 }
        END { printf "Database connections at the busiest sample: %d running a query, %d waiting on a lock\n", act, wait }' \
        diag/containers.csv
    } > diag/containers.md
    ;;
  *)
    echo "Usage: $0 start|stop" >&2
    exit 1
    ;;
esac
