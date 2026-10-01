# EventTix: Backend API

A REST API for event listings and ticket bookings, built with **Node.js, Express and PostgreSQL**.

## Features

- Accounts with hashed passwords and JWT login tokens
- Roles: visitor, user, admin
- Events (admin-managed) and bookings (user-owned) with business rules enforced on the server
- Seats are protected against double-booking with a database transaction and row locking
- Operations endpoints: `/health`, `/version`, `/metrics` (Prometheus)
- Structured JSON logs

## API

| Method | Path             | Who           | Purpose                              |
| ------ | ---------------- | ------------- | ------------------------------------ |
| POST   | `/auth/register` | Anyone        | Create an account                    |
| POST   | `/auth/login`    | Anyone        | Get a login token                    |
| GET    | `/events`        | Anyone        | List events (soonest first)          |
| GET    | `/events/:id`    | Anyone        | Event details                        |
| POST   | `/events`        | Admin         | Create an event                      |
| PUT    | `/events/:id`    | Admin         | Update an event                      |
| DELETE | `/events/:id`    | Admin         | Delete an event                      |
| POST   | `/bookings`      | Logged in     | Book tickets                         |
| GET    | `/bookings`      | Logged in     | My bookings (admin: all bookings)    |
| DELETE | `/bookings/:id`  | Owner / admin | Cancel a booking                     |
| GET    | `/health`        | Anyone        | App and database health (200 / 503)  |
| GET    | `/version`       | Anyone        | Running version and build number     |
| GET    | `/metrics`       | Anyone        | Prometheus metrics                   |

Errors always look like `{ "error": "message" }` with status 400, 401, 403, 404, 409 or 500.

## Business rules and where they are tested

| Rule | Description                                                  | Code                                       |
| ---- | ------------------------------------------------------------ | ------------------------------------------ |
| BR1  | A booking cannot exceed the seats still available            | `domain/bookingRules.js`                   |
| BR2  | At most 6 tickets per booking                                | `domain/bookingRules.js`                   |
| BR3  | Past events cannot be booked                                 | `domain/bookingRules.js`                   |
| BR4  | Cancelling a booking returns its seats                       | `services/bookingService.js`               |
| BR5  | Users cannot see or cancel other users' bookings             | `domain/bookingRules.js`                   |
| BR6  | Only admins can create, edit or delete events                | `middleware/auth.js`                       |
| BR7  | An event with active bookings cannot be deleted              | `services/eventService.js`                 |
| BR8  | Two people booking the last seat cannot both succeed         | `repositories/eventRepository.js` (`FOR UPDATE`) |

Every rule has unit tests (`tests/unit`) and an integration test against a real database (`tests/integration`).

## Project structure

```
src/
  server.js          starts the app (connects, creates tables, seeds, listens)
  app.js             builds the Express app and mounts the routes
  container.js       wires repositories and services together
  config.js          reads settings from environment variables
  routes/            HTTP layer (thin: parse request, call a service, send response)
  services/          business logic
  domain/            pure rules and input validation (no database, easy to test)
  repositories/      all SQL lives here
  middleware/        authentication, request metrics, error handling
  db/                connection pool, transactions, schema.sql
  metrics.js         Prometheus counters and histogram
tests/
  unit/              fast tests with in-memory fakes
  integration/       tests that call the real API against PostgreSQL
```

## Run it

### With Docker (easiest)

From the repository root: `docker compose up --build` (see the root README).

### Directly with Node.js

You need Node.js 20+ and a PostgreSQL database.

```bash
npm install
# set DATABASE_URL and JWT_SECRET (see .env.example), then:
npm start
```

## Tests

The integration tests need a PostgreSQL database. **They empty its tables**, so point them at a throwaway database.

```bash
export TEST_DATABASE_URL=postgres://user:password@localhost:5432/eventtix_test   # Windows PowerShell: $env:TEST_DATABASE_URL="..."
npm run test:unit          # fast, no database needed
npm run test:integration
npm run test:coverage      # everything, with a coverage report (minimum 80%)
```

Results are also written to `reports/junit.xml` (for Jenkins) and `coverage/lcov.info` (for SonarQube).

## Configuration (environment variables)

| Variable                     | Required | Default                      | Purpose                                   |
| ---------------------------- | -------- | ---------------------------- | ----------------------------------------- |
| `DATABASE_URL`               | Yes      |                              | PostgreSQL connection string              |
| `JWT_SECRET`                 | Yes      |                              | Key used to sign login tokens             |
| `PORT`                       | No       | `3000`                       | Port to listen on                         |
| `JWT_EXPIRES_IN`             | No       | `1h`                         | Token lifetime                            |
| `CORS_ORIGINS`               | No       | `http://localhost:8080` and `:5173` | Allowed web app origins (comma separated) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | No    |                              | Creates the first admin on startup        |
| `SEED_DEMO_DATA`             | No       | `false`                      | `true` adds five sample events once       |
| `APP_VERSION`, `BUILD_NUMBER`, `GIT_COMMIT` | No | package version, `local`, `unknown` | Reported by `GET /version`  |
| `APP_ENV`                    | No       | `NODE_ENV`                   | Environment name shown by `GET /version`  |

The app refuses to start if `DATABASE_URL` or `JWT_SECRET` is missing: secrets are never stored in the code.

## Custom metrics

| Metric                          | Type      | Meaning                                              |
| ------------------------------- | --------- | ---------------------------------------------------- |
| `bookings_created_total`        | counter   | Successful bookings                                  |
| `bookings_cancelled_total`      | counter   | Cancelled bookings                                   |
| `booking_failures_total`        | counter   | Failed booking attempts, labelled by `reason`        |
| `http_request_duration_seconds` | histogram | Request time by method, route and status code        |

Default process metrics (CPU, memory, event loop) are exposed as well.
