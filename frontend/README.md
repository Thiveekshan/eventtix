# EventTix: Web front end

A single-page web app for browsing events and booking tickets. It contains no data of its own: everything comes from the EventTix REST API in `../backend`.

**Stack:** React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui components, TanStack Router and TanStack Query.

## Run it locally

```bash
npm install
cp .env.example .env     # on Windows: copy .env.example .env
npm run dev              # http://localhost:8080
```

The backend must be running too. The address of the API is set with `VITE_API_URL` in `.env` (default `http://localhost:3000`). The API must allow cross-origin requests from `http://localhost:8080`, which the EventTix backend does by default.

## Scripts

| Command             | What it does                                 |
| ------------------- | -------------------------------------------- |
| `npm run dev`       | Development server with live reload          |
| `npm run build`     | Production build into `dist/` (static files) |
| `npm run typecheck` | TypeScript type check                        |
| `npm run lint`      | ESLint (includes Prettier formatting rules)  |
| `npm run format`    | Reformat all files with Prettier             |

## Structure

- `src/api/client.ts`: every API call (adds the Bearer token; a 401 logs the user out and redirects to `/login`)
- `src/context/AuthContext.tsx`: login state, stored in `localStorage`
- `src/pages/`: one component per page (events, event details, login, register, bookings, admin, 404)
- `src/components/`: shared pieces (navbar, footer, event card, dialogs) and `ui/` building blocks
- `src/routes/`: thin route files that map URLs to pages (file-based routing)

## Design rules

- It is a static single-page app: `npm run build` writes `index.html` and `assets/` to `dist/`. There is no server-side code at runtime.
- All data comes from the REST API through `src/api/client.ts`. There is no mock data and no built-in backend.
- The footer shows the API version and build number (`GET /version`) and a live status dot (`GET /health`).

## Docker

The `Dockerfile` builds the app and serves `dist/` with nginx (as a non-root user, on port 8080). The image is built with `VITE_API_URL=/api`, and nginx forwards `/api/*` to the backend, so **one image works in every environment**. Any other address falls back to `index.html`, so deep links like `/events/3` work.
