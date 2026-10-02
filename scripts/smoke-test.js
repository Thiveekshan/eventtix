'use strict';

/**
 * Post-deployment smoke test.
 *
 * Run inside the deployed backend container (see scripts/deploy.sh), so it reaches
 *   - the API directly at SMOKE_API   (default http://127.0.0.1:3000), and
 *   - the website and its /api proxy at SMOKE_WEB (default http://frontend:8080).
 *
 * It proves that the build that was just deployed is the one running, that the database works,
 * and (in "full" mode) that a real user can register, log in, book and cancel a ticket.
 *
 * Settings (environment variables):
 *   EXPECTED_BUILD  build number that must be running (e.g. 7)
 *   EXPECTED_ENV    environment name that must be reported (e.g. staging)
 *   SMOKE_MODE      "full" (default): also makes and cancels a test booking
 *                   "read-only": only reads data (used for production)
 *
 * Exit code 0 = all checks passed, 1 = something failed.
 */

const API = process.env.SMOKE_API || 'http://127.0.0.1:3000';
const WEB = process.env.SMOKE_WEB || 'http://frontend:8080';
const EXPECTED_BUILD = process.env.EXPECTED_BUILD || '';
const EXPECTED_ENV = process.env.EXPECTED_ENV || '';
const MODE = process.env.SMOKE_MODE || 'full';
const TIMEOUT_MS = 8000;

const results = [];

async function http(url, options = {}) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), ...options });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, text, json };
}

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function step(name, work) {
  try {
    const detail = await work();
    results.push({ name, ok: true, detail: detail || '' });
    return true;
  } catch (err) {
    results.push({ name, ok: false, detail: err.message });
    return false;
  }
}

function jsonBody(body, token) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  };
}

async function main() {
  // --- The API itself ------------------------------------------------------
  await step('API health: app and database are up', async () => {
    const res = await http(`${API}/health`);
    expect(res.status === 200, `GET /health returned HTTP ${res.status}`);
    expect(res.json && res.json.status === 'ok' && res.json.database === 'ok', `unexpected body: ${res.text}`);
  });

  await step('API version: the new build is the one running', async () => {
    const res = await http(`${API}/version`);
    expect(res.status === 200, `GET /version returned HTTP ${res.status}`);
    if (EXPECTED_BUILD) {
      expect(String(res.json.build) === EXPECTED_BUILD, `running build is ${res.json.build}, expected ${EXPECTED_BUILD}`);
    }
    if (EXPECTED_ENV) {
      expect(res.json.environment === EXPECTED_ENV, `environment is "${res.json.environment}", expected "${EXPECTED_ENV}"`);
    }
    return `version ${res.json.version}, build ${res.json.build}, environment ${res.json.environment}`;
  });

  await step('API data: events can be listed from the database', async () => {
    const res = await http(`${API}/events`);
    expect(res.status === 200 && Array.isArray(res.json), `GET /events returned HTTP ${res.status}`);
    return `${res.json.length} event(s)`;
  });

  await step('API metrics: Prometheus metrics are exposed', async () => {
    const res = await http(`${API}/metrics`);
    expect(res.status === 200, `GET /metrics returned HTTP ${res.status}`);
    expect(res.text.includes('bookings_created_total'), 'bookings_created_total is missing');
    expect(res.text.includes('http_request_duration_seconds'), 'http_request_duration_seconds is missing');
  });

  // --- The website, and its connection to the API --------------------------
  await step('Website: home page is served', async () => {
    const res = await http(`${WEB}/`);
    expect(res.status === 200, `GET / returned HTTP ${res.status}`);
    expect(res.text.includes('EventTix'), 'the page does not mention EventTix');
  });

  await step('Website: deep links work (single-page app fallback)', async () => {
    const res = await http(`${WEB}/events/1`);
    expect(res.status === 200 && res.text.includes('EventTix'), `GET /events/1 returned HTTP ${res.status}`);
  });

  await step('Website: /api proxy reaches the same build', async () => {
    const res = await http(`${WEB}/api/version`);
    expect(res.status === 200, `GET /api/version returned HTTP ${res.status}`);
    if (EXPECTED_BUILD) {
      expect(String(res.json.build) === EXPECTED_BUILD, `proxy reports build ${res.json.build}, expected ${EXPECTED_BUILD}`);
    }
  });

  // --- A real user journey (staging only) ----------------------------------
  if (MODE === 'full') {
    const user = {
      name: 'Smoke Test',
      email: `smoke-${Date.now()}@example.com`,
      password: `Pw-${Math.random().toString(36).slice(2)}-${Date.now()}`,
    };
    const state = {};

    const registered = await step('Journey: register a new user', async () => {
      const res = await http(`${WEB}/api/auth/register`, jsonBody(user));
      expect(res.status === 201, `register returned HTTP ${res.status}: ${res.text}`);
    });

    const loggedIn =
      registered &&
      (await step('Journey: log in and receive a token', async () => {
        const res = await http(`${WEB}/api/auth/login`, jsonBody({ email: user.email, password: user.password }));
        expect(res.status === 200 && res.json.token, `login returned HTTP ${res.status}: ${res.text}`);
        state.token = res.json.token;
      }));

    if (loggedIn) {
      await step('Journey: book a ticket, check the seats, cancel it', async () => {
        const list = await http(`${WEB}/api/events`);
        const event = (list.json || []).find((e) => new Date(e.date) > new Date() && e.seatsAvailable >= 1);
        if (!event) {
          return 'skipped: no upcoming event with free seats';
        }
        const before = event.seatsAvailable;

        const booked = await http(`${WEB}/api/bookings`, jsonBody({ eventId: event.id, quantity: 1 }, state.token));
        expect(booked.status === 201 && booked.json.status === 'confirmed', `booking returned HTTP ${booked.status}: ${booked.text}`);

        const afterBooking = await http(`${WEB}/api/events/${event.id}`);
        expect(afterBooking.json.seatsAvailable === before - 1, 'seats were not reduced by the booking');

        const mine = await http(`${WEB}/api/bookings`, { headers: { Authorization: `Bearer ${state.token}` } });
        expect(mine.json.some((b) => b.id === booked.json.id), 'the booking is missing from "my bookings"');

        const cancelled = await http(`${WEB}/api/bookings/${booked.json.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${state.token}` },
        });
        expect(cancelled.status === 200 && cancelled.json.status === 'cancelled', `cancel returned HTTP ${cancelled.status}`);

        const afterCancel = await http(`${WEB}/api/events/${event.id}`);
        expect(afterCancel.json.seatsAvailable === before, 'seats were not returned after cancelling');
        return `"${event.title}": ${before} -> ${before - 1} -> ${before} seats`;
      });
    }
  }

  // --- Report ---------------------------------------------------------------
  console.log(`Smoke test (${MODE} mode)`);
  for (const r of results) {
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `SMOKE TEST FAILED (${failed} of ${results.length} checks)` : `SMOKE TEST PASSED (${results.length} checks)`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`Smoke test crashed: ${err.message}`);
  process.exit(1);
});
