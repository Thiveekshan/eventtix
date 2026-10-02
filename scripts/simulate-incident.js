'use strict';

/**
 * Incident simulation: a burst of rejected bookings.
 *
 * Run it inside the production API container, so it talks to the API directly:
 *
 *   docker exec -i -e DURATION_SECONDS=120 eventtix-production-backend-1 node - < scripts/simulate-incident.js
 *
 * What it does: registers a throwaway user, logs in, then keeps trying to book 7 tickets (more than the
 * allowed 6) over and over. Every attempt is correctly rejected, but together they look like a booking
 * failure spike. About a minute in, the "EventTixBookingFailureSpike" alert fires and the team is notified.
 * A couple of minutes after the burst stops, the alert resolves by itself.
 *
 * Settings (environment variables):
 *   DURATION_SECONDS    how long the burst lasts          (default 120)
 *   RATE_PER_SECOND     rejected bookings per second      (default 10)
 *   SMOKE_API           API address inside the container  (default http://127.0.0.1:3000)
 *
 * It only sends requests the API rejects, so no tickets are booked and no events change.
 */

const API = process.env.SMOKE_API || 'http://127.0.0.1:3000';
const DURATION = Number(process.env.DURATION_SECONDS || 120);
const RATE = Number(process.env.RATE_PER_SECOND || 10);

async function call(path, options = {}) {
  const res = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(8000), ...options });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, json };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const email = `incident-sim-${Date.now()}@example.com`;
  const password = `Sim-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  const post = (path, body, token) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

  const registered = await call('/auth/register', post('', { name: 'Incident Simulation', email, password }));
  if (registered.status !== 201) {
    throw new Error(`could not register the simulation user (HTTP ${registered.status})`);
  }
  const login = await call('/auth/login', post('', { email, password }));
  if (login.status !== 200) {
    throw new Error(`could not log in (HTTP ${login.status})`);
  }
  const events = await call('/events');
  if (!events.json || events.json.length === 0) {
    throw new Error('there is no event to send bookings for');
  }
  const eventId = events.json[0].id;
  const token = login.json.token;

  console.log(`Incident simulation: ${RATE} rejected bookings per second for ${DURATION} seconds`);
  console.log('Watch: http://localhost:3030 (dashboard), http://localhost:9090/alerts, http://localhost:9093');

  let sent = 0;
  let rejected = 0;
  const startedAt = Date.now();
  while ((Date.now() - startedAt) / 1000 < DURATION) {
    const second = Date.now();
    const attempts = Array.from({ length: RATE }, () =>
      call('/bookings', post('', { eventId, quantity: 7 }, token)).then((res) => {
        sent += 1;
        if (res.status === 400) rejected += 1;
      }),
    );
    await Promise.all(attempts);
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    if (elapsed % 10 === 0) {
      console.log(`  ${elapsed}s: ${sent} attempts sent, ${rejected} rejected`);
    }
    await sleep(Math.max(0, 1000 - (Date.now() - second)));
  }

  console.log(`Done: ${sent} booking attempts sent, ${rejected} correctly rejected.`);
  console.log('Expected: EventTixBookingFailureSpike fires after about a minute, and resolves a few minutes after this stops.');
}

main().catch((err) => {
  console.error(`Simulation failed: ${err.message}`);
  process.exit(1);
});
