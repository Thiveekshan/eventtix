# EventTix

A full-stack event ticket booking system with a **Jenkins CI/CD pipeline**, built for the SIT223/SIT753 High Distinction task.

Users browse events and book tickets. Admins create and manage events. The application exists to give the pipeline real work: build, test, quality analysis, security scanning, deployment, release and monitoring.

```
Browser ──► nginx (frontend container) ──/api──► Node.js API (backend container) ──► PostgreSQL
                                                    │
                                                    └── /metrics ──► Prometheus ──► Grafana + alerts
```

| Folder      | Contents                                                          |
| ----------- | ----------------------------------------------------------------- |
| `frontend/` | React single-page app, served by nginx                            |
| `backend/`  | Node.js + Express REST API (tests, Dockerfile)                    |

See [`backend/README.md`](backend/README.md) for the API, business rules and tests, and [`frontend/README.md`](frontend/README.md) for the web app.

## Run the whole system

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
cp .env.example .env        # Windows: copy .env.example .env
# open .env and replace every CHANGE-ME value
docker compose up --build
```

Then open **http://localhost:8080**. Sign in as the admin account you set in `.env`.

| Address                          | What                          |
| -------------------------------- | ----------------------------- |
| http://localhost:8080            | The web app                   |
| http://localhost:3000/health     | API health check              |
| http://localhost:3000/version    | Running version and build     |
| http://localhost:3000/metrics    | Prometheus metrics            |

Stop it with `Ctrl+C`, and remove it with `docker compose down` (add `-v` to also delete the database).

## Run the tests

```bash
cd backend
npm install
npm run test:unit
```

The integration tests need a throwaway PostgreSQL database; see `backend/README.md`.

## Pipeline

The Jenkins pipeline (`Jenkinsfile`) has seven stages: Build, Test, Code Quality, Security, Deploy, Release, Monitoring and Alerting. It is added in the next step of the project.
