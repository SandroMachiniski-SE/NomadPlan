> 🇧🇷 Versão em português: [README.pt-BR.md](README.pt-BR.md)

# NomadPlan

Academic full-stack travel itinerary project built with TypeScript, React, Node.js and PostgreSQL/PostGIS.

The project combines a travel-planning interface, a REST API and geospatial data. The repository includes automated tests, CI configuration, Docker setup and technical documentation.

## What to inspect first

- API and data model: how places, users and itineraries are represented.
- Authentication: JWT, rate limiting and single-use password reset links.
- Quality checks: automated tests, Playwright scenarios and CI configuration.

The sections below explain features, setup, tests and technical decisions.

## ✨ Features

- **Real data:** about 3,200 places in Joinville, Florianópolis, Blumenau, Pomerode, São Francisco do Sul and Urubici, imported from OpenStreetMap and completed with phone numbers, websites and lodging from Overture Maps, photos from Wikimedia Commons and a curated set based on official sources. Optionally, rating, opening hours and photo from Google Maps, fetched on demand. The community fills in what's missing.
- **Explore:** search by city, category, text, accessibility, price range, minimum rating, "open now" and proximity (radius from a location), sorted by relevance, distance, name or rating; interactive map.
- **Saved places (favorites)** and **recommendations** based on profile interests and the taste of similar users.
- **Itineraries:** multi-**day** trips (with dates and weekday), map with numbered stops and each day's route, **estimated time and distance between stops**, a button to **optimize the order** for the shortest path, **budget** (cost per stop, daily total and spending cap), trip **checklist** and **notes**, **collaboration** (e-mail invitations with editor and reader roles, automatic updates between participants), public link sharing, version history with restore, and **automatic generation** with estimated arrival/departure, travel and waiting times.
- **Travel notebook:** trips across **several cities** (the road time between them shows up on its own), **free activities** ("Stroll downtown", "Free day"), **period of the day** (morning, afternoon, evening) and **where to sleep** each night (a hotel from the database or free text, such as "Camping in the mountains"). The generator builds the trip in stages ("Joinville, 2 days → Blumenau, 1 day"). The seed brings a 10-day sample itinerary for the region under the `morador@nomadplan.local` account (`npm run roteiro:exemplo` creates it in databases that already existed).
- **Road trip:** starting from the home city (chosen at sign-up by search or GPS), the road is split into days by a daily distance target (and, optionally, by a maximum number of driving hours), with an overnight stay suggested in a city within 50 km of the target (the cities along the way do not need to be downloaded first; a destination without places starts being prepared automatically), chosen by proximity, lodging and attractions, plus alternatives to swap. It applies to the outbound leg, between cities and the way back; when the destination is close, the user chooses between stretching the day to arrive or sleeping before. With the car's consumption and the fuel price, it estimates fuel and adds it to the budget. Routes from [OSRM](https://project-osrm.org) and municipalities from IBGE; before a presentation, `npm run viagem:preparar -- "Joinville/SC" "Brasília/DF"` leaves the trip ready in the database (see [docs/operacao.md](docs/operacao.md)).
- **Community contributions:** any account can add a missing place (even by clicking the search map: "Cadastrar um lugar aqui"), published after moderation; reviews (with photos), edit suggestions confirmed across users or applied directly by users with reputation, verified-place badge.
- **Submission and moderation:** new places enter as drafts, go through review with a rejection reason, duplicate detection and protection against simultaneous edits; CSV and GeoJSON import/export.
- **Administration:** roles (visitor, resident, business, city manager, moderator, administrator), account deactivation, audit log, daily usage metrics with CSV export.
- **Security and privacy (LGPD):** two-factor verification (TOTP), login attempt lockout, password recovery by e-mail, policy acceptance, download of your own data and account deletion.

## 🚀 Tech stack

| Layer | Technologies |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, React Router, Leaflet (maps), Axios |
| Backend | Node.js 22, Express, TypeScript, Prisma, Zod, JWT, bcrypt, Nodemailer |
| Database | PostgreSQL 16 + PostGIS (radius search with geographic index) |
| Tests | `node:test` + `tsx` (unit and integration against a real database), Playwright (end to end) |
| Infra | Docker Compose (database and test mailbox), GitHub Actions (CI) |

## 📌 Getting started

Prerequisites: Node.js 22+, Docker Desktop and Git. Run each step from the project root.

1. Clone the repository and start the database (PostgreSQL + PostGIS) and the test mailbox (Mailpit):
   ```bash
   git clone https://github.com/SandroMachiniski-SE/NomadPlan.git
   cd NomadPlan
   docker compose up -d
   ```

2. Backend (port 3333):
   ```bash
   cd backend
   cp .env.example .env
   npm install
   npx prisma migrate deploy
   npm run prisma:seed
   npm run dev
   ```
 `npm install` already runs `prisma generate`. The `.env` is **not** versioned: copy `.env.example` and adjust it. **Never use `prisma migrate dev`** in this project (the schema has a geographic column Prisma does not model); migrations are written by hand and applied with `migrate deploy`.

3. Frontend (port 5173), in another terminal:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
 Then open http://localhost:5173.

Demo accounts created by `prisma:seed` (password `senha-temporaria`): `admin@nomadplan.local`, `moderador@nomadplan.local`, `negocio@nomadplan.local` and `morador@nomadplan.local`. The seed also loads the real places of Joinville, Florianópolis and Blumenau (about 2,000, from OpenStreetMap; see below), can be re-run without duplicating anything, and **refuses to run in production**.

### Real data (OpenStreetMap)

Places come from [OpenStreetMap](https://www.openstreetmap.org), an open and free database, and are stored in `backend/prisma/dados/osm/`. Photos come from Wikimedia Commons. To update or add another city:

```bash
cd backend
npm run osm:baixar -- Joinville Florianópolis Blumenau "Balneário Camboriú"
npm run osm:importar
```

The import is designed not to duplicate places and not to overwrite what the community has edited: it only fills empty fields. Phone numbers, websites and lodging from [Overture Maps](https://overturemaps.org) come in with `python scripts/dados/baixar_overture.py <city>` and `npm run overture:importar`; the curated set based on official sources (`prisma/dados/curadoria.json`) comes in with `npm run curadoria:aplicar`. With `GOOGLE_MAPS_API_KEY` in `.env`, the place page and the itinerary generator query Google Maps on demand (nothing from Google is stored besides the place identifier). Database created with an old seed version? `npm run osm:importar -- --remover-ficticios` removes the 110 fictional places from before. Details in [docs/operacao.md](docs/operacao.md#dados-reais-openstreetmap).

Data © OpenStreetMap contributors, under the [ODbL](https://www.openstreetmap.org/copyright) license. Overture Maps data under the [CDLA Permissive 2.0](https://cdla.dev/permissive-2-0/) license. Photos from Wikimedia Commons, with author and license credited on each place.

## 🧪 Tests

```bash
# Backend: unit + integration (uses a "nomadplan_teste" database, created automatically)
cd backend
npm test
npm run test:cobertura   # with coverage report; fails below 60% of lines
npm run typecheck

# Frontend
cd frontend
npm run lint
npm run build

# End to end: boots its own API and frontend (database "nomadplan_e2e") and drives the browser
cd e2e
npm install
npx playwright test
```

- The **integration** tests boot the real API and talk over HTTP to a real PostgreSQL, covering authentication (including 2FA and login lockout), places, search, contributions, moderation, import, itineraries, favorites, notifications, administration and rate limits. Each test starts with a clean database.
- The **end-to-end** tests (Playwright, 74 scenarios) walk the main flows in the browser: sign-up and login, search and filters, favorites, photo reviews, place submission and moderation, itineraries (manual, generated and collaborative), OpenStreetMap-imported places, profile, 2FA, LGPD and administration. Locally they use the installed Microsoft Edge; in CI, Chromium.
- On every *push*, GitHub Actions runs all of this (`.github/workflows/ci.yml`).
- Load test: [docs/relatorio-de-carga.md](docs/relatorio-de-carga.md).

## 📚 Documentation

| Document | Contents |
| --- | --- |
| [docs/api.md](docs/api.md) | Every API route, with permissions, parameters and responses |
| [docs/dicionario-de-dados.md](docs/dicionario-de-dados.md) | Tables, columns, relationships and personal data |
| [docs/operacao.md](docs/operacao.md) | Deployment, rollback, backup, restore, monitoring |
| [docs/seguranca.md](docs/seguranca.md) | Controls by OWASP Top 10 category and accepted risks |
| [docs/relatorio-de-carga.md](docs/relatorio-de-carga.md) | Results of the 100-concurrent-user test |
| [RFC.pdf](RFC.pdf) | Full project specification (requirements, business rules, flows) |

## 🗂️ Structure

```
backend/    API (src/routes, src/lib, src/middleware), Prisma schema and migrations, tests
frontend/   React application (src/pages, src/components, src/context, src/styles)
e2e/        end-to-end tests (Playwright) and load script
scripts/    backup and restore (bash and PowerShell)
docs/       technical documentation
```

## 📧 Password recovery

On the login screen, **"Esqueci minha senha"** asks for the account e-mail and the system automatically sends a message to **the user's own e-mail address** with a link to choose a new password. The link is valid for 15 minutes and can be used only once. There is nothing to register per user: any registered account receives it at its own address.

For this, the backend needs **one sending account** (the system sender, such as a `no-reply@`), configured once in `backend/.env`. It is only who *sends*; each user is who *receives*.

### Setting up sending (Gmail, free)

1. In the Google account that will be the sender, turn on **two-step verification**.
2. Create an **app password** at https://myaccount.google.com/apppasswords (16 characters).
3. Fill in `backend/.env`:
   ```env
   SMTP_HOST="smtp.gmail.com"
   SMTP_PORT=587
   SMTP_USER="youremail@gmail.com"
   SMTP_PASS="the 16-character app password"
   ```
4. Check that everything works (sends a test e-mail):
   ```bash
   cd backend
   npm run email:testar -- youremail@gmail.com
   ```
5. Restart the backend. On startup it shows `E-mail: enviando por smtp.gmail.com:587 ...`.

Gmail shows the account itself as sender. For higher volume or a sender with your own domain, use any SMTP service (Brevo, Mailgun, SendGrid, Amazon SES): just replace `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `EMAIL_FROM`.

### Without an e-mail server (development only)

Without `SMTP_HOST`, no e-mail is sent: the reset link is printed to the **backend console** (look for `[e-mail em modo de desenvolvimento]`) and the backend warns about it on startup. In production, without SMTP, nothing is sent and the server logs a warning.

Optionally, `docker compose up -d` also starts [Mailpit](https://mailpit.axllent.org/), a test inbox at http://localhost:8025 that **keeps** e-mails without delivering them to anyone. To use it, set `SMTP_HOST="localhost"` and `SMTP_PORT=1025`. If another Mailpit already occupies ports 1025 and 8025 (the container fails with "address already in use"), create a `.env` in the project root with `MAILPIT_SMTP_PORT=1026` and `MAILPIT_WEB_PORT=8026`, run `docker compose up -d mailpit` and use `SMTP_PORT=1026` in the backend; the inbox becomes http://localhost:8026.

## 🔒 Security

Summary; the breakdown by OWASP Top 10 category and accepted risks are in [docs/seguranca.md](docs/seguranca.md).

- **`JWT_SECRET` and `CHAVE_CRIPTOGRAFIA`**: in production (`NODE_ENV=production`) the API refuses to start with a short (under 32 characters) or example `JWT_SECRET`. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. `CHAVE_CRIPTOGRAFIA` encrypts the 2FA secret in the database.
- **Rate limit**: login (by IP and by e-mail), sign-up, contributions and password recovery have attempt limits per 15-minute window. Behind a reverse proxy, set `TRUST_PROXY`.
- **Sessions** expire and are renewed while the user is active; the token is checked against the database on every request, so deactivating or demoting an account takes effect immediately.
- **Login**: designed to answer in the same time for registered and unregistered e-mails (covered by an automated test); password reset works only once.
- **Secrets in the repository**: `backend/.env` and `node_modules` are not versioned. If a secret was ever exposed in git history, see [docs/seguranca-credenciais-no-historico.md](docs/seguranca-credenciais-no-historico.md).

## 🎯 Purpose

Project developed as part of the academic portfolio for the 7th semester of the Software Engineering program, focused on architecture, system design and development best practices.
