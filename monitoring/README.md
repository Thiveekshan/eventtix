# Monitoring and alerting

The pipeline's last stage deploys a monitoring stack that watches the **production** application and tells the team when something is wrong.

| Tool             | What it does                                                                 | Address                         |
| ---------------- | ---------------------------------------------------------------------------- | ------------------------------- |
| **Prometheus**   | Collects the API's metrics every 5 seconds and checks the alert rules        | http://localhost:9090           |
| **Alertmanager** | Groups alerts, silences the ones caused by a bigger problem, notifies people | http://localhost:9093           |
| **Grafana**      | Live dashboard "EventTix Production"                                         | http://localhost:3030 (admin)   |

```
production API  --/metrics-->  Prometheus  --alerts-->  Alertmanager  -->  Discord (the team)
                                    |
                                    +--------> Grafana (dashboard)
```

Everything is defined as code in this folder and rebuilt by Jenkins on every release. Nothing is set up by clicking.

## What the API reports

`GET /metrics` on the API exposes numbers in the Prometheus format:

| Metric                                  | Meaning                                                      |
| --------------------------------------- | ------------------------------------------------------------ |
| `eventtix_database_up`                  | 1 if the API can reach its database, 0 if not (live check)   |
| `http_request_duration_seconds`         | How long requests take, by page and status code              |
| `bookings_created_total`                | Successful bookings                                          |
| `booking_failures_total{reason=...}`    | Rejected bookings and why (`validation`, `sold_out`, `server_error`...) |
| `process_*`, `nodejs_*`                 | CPU, memory, event loop                                      |

## The alert rules

| Alert                        | Fires when                                                | Severity | After   |
| ---------------------------- | --------------------------------------------------------- | -------- | ------- |
| `EventTixApiDown`            | Prometheus cannot reach the API                           | critical | 30 s    |
| `EventTixDatabaseDown`       | The API cannot reach its database                         | critical | 30 s    |
| `EventTixHighErrorRate`      | More than 5% of requests fail with a server error         | critical | 1 min   |
| `EventTixBookingServerErrors`| Bookings fail because of a system error (not user mistakes) | critical | 1 min |
| `EventTixSlowResponses`      | The slowest 5% of requests take more than 1 second        | warning  | 5 min   |
| `EventTixBookingFailureSpike`| More than 0.5 booking attempts per second are rejected    | warning  | 1 min   |
| `EventTixHighMemory`         | The API uses more than 400 MiB of memory                  | warning  | 5 min   |

Two design choices keep the team from being flooded:

- **A root cause silences what it causes.** If the API is down, the database and error alerts are suppressed. If the database is down, the error alerts are suppressed too (Alertmanager "inhibit rules"), so the team gets one clear message.
- **No echo after recovery.** The error alerts stay quiet while the database is down *and for 2 minutes after*, so fixing the problem does not trigger a second alert about the same incident.

The rules have unit tests (`prometheus/alerts.test.yml`) that run on every release: fake data goes in, and the test checks that each alert fires when it should and stays silent when it should.

## Getting alerts in Discord (optional, 2 minutes)

1. In Discord, open a channel's settings, **Integrations**, **Webhooks**, **New Webhook**, then **Copy Webhook URL**.
2. Put that address in the monitoring secret file (`DISCORD_WEBHOOK_URL=...`), upload it to Jenkins, and run the pipeline.

Without a webhook, alerts still appear in Prometheus (`/alerts`), Alertmanager and Grafana.
Every release also sends one `EventTixMonitoringDeployed` message, which proves the whole alert path works.

## Incident simulation (for the demo video)

Break production on purpose and watch the system react. Commands are for Windows Command Prompt, run from the repository folder. Have the dashboard (http://localhost:3030), http://localhost:9090/alerts and Discord open side by side.

### A. The database goes down

```
docker stop eventtix-production-db-1
```

| Time    | What you see                                                                      |
| ------- | --------------------------------------------------------------------------------- |
| 0 s     | Dashboard: **Database** turns red (DOWN)                                          |
| ~10 s   | Prometheus `/alerts`: `EventTixDatabaseDown` is **Pending**                       |
| ~40 s   | It turns **Firing**, and Discord shows `[FIRING] EventTixDatabaseDown`            |

Recover it:

```
docker start eventtix-production-db-1
```

Within about a minute Discord shows `[RESOLVED]` and the dashboard turns green again.

### B. A burst of failing bookings

```
docker exec -i -e DURATION_SECONDS=90 eventtix-production-backend-1 node - < scripts\simulate-incident.js
```

The script tries to book 7 tickets (the limit is 6) ten times a second. Every attempt is correctly rejected, but together they look like a problem.

| Time     | What you see                                                                     |
| -------- | -------------------------------------------------------------------------------- |
| ~5 s     | Dashboard: **Rejected bookings per minute** climbs (reason `validation`)         |
| ~70 s    | `EventTixBookingFailureSpike` fires, Discord shows how many per second and what to do |
| ~2 min after it stops | The alert resolves by itself                                        |

### C. The whole API goes down

```
docker stop eventtix-production-backend-1
docker start eventtix-production-backend-1
```

`EventTixApiDown` fires after about 40 seconds. The website footer also shows **API offline**.

## Files

| Path                                 | Purpose                                                  |
| ------------------------------------ | -------------------------------------------------------- |
| `docker-compose.yml`                 | The three services and how they connect                  |
| `prometheus/prometheus.yml`          | What to scrape and how often                             |
| `prometheus/alerts.yml`              | The alert rules                                          |
| `prometheus/alerts.test.yml`         | Unit tests for the alert rules                           |
| `alertmanager/alertmanager.base.yml` | Routing, grouping, silencing                             |
| `alertmanager/entrypoint.sh`         | Adds the Discord channel from a secret at start-up       |
| `grafana/provisioning/`              | Data sources and dashboard loading, as code              |
| `grafana/dashboards/`                | The "EventTix Production" dashboard                      |
| `secrets.example`                    | Template for the secret file (never commit the real one) |
