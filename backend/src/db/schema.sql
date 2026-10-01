-- EventTix database schema. Safe to run repeatedly (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT         NOT NULL,
  role          VARCHAR(10)  NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
  id              SERIAL PRIMARY KEY,
  title           VARCHAR(200)  NOT NULL,
  description     TEXT          NOT NULL DEFAULT '',
  venue           VARCHAR(200)  NOT NULL,
  event_date      TIMESTAMPTZ   NOT NULL,
  price           NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  capacity        INTEGER       NOT NULL CHECK (capacity > 0),
  seats_available INTEGER       NOT NULL CHECK (seats_available >= 0),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT seats_within_capacity CHECK (seats_available <= capacity)
);

CREATE TABLE IF NOT EXISTS bookings (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER       NOT NULL REFERENCES users (id)  ON DELETE CASCADE,
  event_id    INTEGER       NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  quantity    INTEGER       NOT NULL CHECK (quantity BETWEEN 1 AND 6),
  total_price NUMERIC(10,2) NOT NULL CHECK (total_price >= 0),
  status      VARCHAR(10)   NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_user  ON bookings (user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_event ON bookings (event_id, status);
CREATE INDEX IF NOT EXISTS idx_events_date    ON events (event_date);
