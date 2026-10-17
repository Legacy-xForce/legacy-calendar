# Legacy Calendar

Legacy Calendar is a full-stack event planning and coordination platform built as a monorepo with a Vue 3 frontend and a NestJS backend. It combines a calendar-centric planning experience with event detail views, invitations, attendance tracking, chat, notifications, ride assignments, weather, maps, and admin tools.

The project is designed around a real-time, mobile-friendly workflow: users can manage their own schedule, inspect upcoming events, join or leave attendance, chat inside event rooms, receive push notifications, and upload media or profile pictures. Administrators get user management and impersonation tools for support and moderation.

## Project Structure

```text
.
├── src
│   ├── backend   # NestJS API, WebSocket gateway, Prisma data layer, uploads, notifications
│   └── frontend  # Vue 3 app, calendar UI, event views, chat, profile, admin dashboard
└── README.md
```

## Tech Stack

### Backend

- Node.js
- NestJS 11
- Prisma 7 with PostgreSQL
- Socket.IO for event chat and live updates
- Passport JWT and local auth strategies
- Swagger for API documentation
- Firebase Admin for push notifications
- Multer-based file uploads
- Compression middleware

### Frontend

- Vue 3
- Vite
- TypeScript
- Pinia
- Vue Router
- PrimeVue
- Tailwind CSS 4
- Socket.IO client
- Firebase Cloud Messaging
- MapLibre GL
- Open-Meteo
- IndexedDB caching via `idb-keyval`
- PWA support

## What The App Does

### Calendar and Events

- Month-based calendar view with swipe navigation on mobile
- Create, edit, inspect, and delete events
- Event participation flow with invite statuses
- Ride assignment support for passengers and drivers
- Shared event deep links that open directly inside the calendar experience

### Upcoming View

- A focused list of near-future events
- Weather badges and event cards for quick scanning
- Quick access to the next event and later events

### Event Detail Experience

- Rich event view dialog
- Event participants table
- Transport and ride assignment sections
- Event location map preview
- Weather forecast and hourly breakdowns
- In-event chat with live typing, reactions, pinning, editing, and deletion

### User and Admin Features

- User profile with password change and avatar upload
- Local notification preference toggles
- Cache clearing for locally stored weather and geolocation data
- Admin user management
- Admin impersonation for support workflows

## Backend Architecture

The backend is organized by domain and keeps controllers, services, and repositories separated.

- `auth` handles login, JWT issuance, password changes, and auth guards
- `users` handles user CRUD and profile picture management
- `events` handles calendar events, participation, invitations, and ride assignments
- `chat` handles message history, media uploads, reactions, pinning, editing, and Socket.IO realtime delivery
- `notifications` handles Firebase Cloud Messaging subscriptions and sends
- `uploads` serves uploaded files from disk and falls back to a remote uploads origin when configured
- `prisma` wraps the Prisma client and PostgreSQL adapter

### Data Model

The Prisma schema models:

- users
- events
- attendance and invite status
- ride assignments
- chat messages
- chat reactions
- FCM tokens

That schema supports both the calendar workflow and the collaboration features around each event.

## Frontend Architecture

The frontend is a Vue 3 SPA with route-level code splitting and store-driven state.

- `src/router/router.ts` defines auth-aware routes and admin access checks
- `src/stores/session.ts` manages the current session
- `src/stores/events.ts` manages calendar and upcoming event data
- `src/stores/users.ts` supports the admin user management screen
- `src/components` contains reusable UI building blocks
- `src/composables` contains feature logic such as calendar behavior, sharing, geocoding, weather, and chat
- `src/theme/oled.ts` defines the custom dark theme

## Design Choices

### Dark, High-Contrast UI

The UI intentionally leans into a dark OLED-style presentation. The app uses a custom PrimeVue theme, rounded surfaces, subtle borders, and strong contrast to keep dense calendar and chat workflows readable.

### Component-Driven Layout

The frontend breaks large features into focused pieces:

- reusable calendar cells and dialogs
- isolated event view sections
- separate chat, weather, map, and participant components
- small composables for feature logic instead of large monolithic views

This keeps the UI easier to extend without turning the view files into everything-at-once screens.

### Real-Time First

Chat is implemented with Socket.IO rather than polling so new messages, reactions, pins, edits, and typing indicators update immediately. The backend gateway also validates access to event rooms before a socket can join.

### Progressive Enhancement

The app includes PWA support, foreground and background push notifications, local preference storage, and cached weather/geolocation data. That makes the experience faster and more resilient after the initial load.

### Media and Map Support

Event detail views support richer coordination with map previews, location context, and media uploads for both profile pictures and chat attachments.

### Security and Access Control

The backend uses JWT-based authentication, route guards, role checks, and impersonation headers for admin workflows. The frontend mirrors this with route metadata and navigation guards.

## Getting Started

This repository is organized as two separate applications under `src/`, so install and run them from the relevant subdirectory.

### Prerequisites

- Node.js 20+ recommended
- npm
- PostgreSQL database
- Firebase project credentials for push notifications and the client app

### Backend Setup

```bash
cd src/backend
npm install
```

Create a `.env` file in `src/backend` using the example below:

```bash
DATABASE_URL=postgresql://user:password@host/database
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=30d
LOG_LEVEL=trace
```

Then run Prisma and start the API:

```bash
npm run generate
npm run migrate
npm run dev
```

The backend listens on port `3000` by default. Swagger is available at:

```text
http://localhost:3000/api
```

### Frontend Setup

```bash
cd src/frontend
npm install
```

Create a `.env` file in `src/frontend` with the client and Firebase settings expected by the app:

```bash
VITE_API_URL=http://localhost:3000
VITE_UPLOADS_API_URL=http://localhost:3000
VITE_LOG_LEVEL=trace
VITE_FIREBASE_API_KEY=your-value
VITE_FIREBASE_AUTH_DOMAIN=your-value
VITE_FIREBASE_PROJECT_ID=your-value
VITE_FIREBASE_STORAGE_BUCKET=your-value
VITE_FIREBASE_MESSAGING_SENDER_ID=your-value
VITE_FIREBASE_APP_ID=your-value
VITE_FIREBASE_MEASUREMENT_ID=your-value
VITE_FIREBASE_VAPID_KEY=your-value
VITE_GOOGLE_MAPS_EMBED_API_KEY=your-value
```

Then start the client:

```bash
npm run dev
```

## Common Scripts

### Backend

- `npm run dev` - run the NestJS app with `tsx`
- `npm run start:dev` - run in watch mode
- `npm run build` - compile TypeScript
- `npm run start` - run the compiled app from `dist`
- `npm run generate` - generate Prisma client
- `npm run migrate` - run Prisma migrations in development
- `npm run lint` - lint backend TypeScript
- `npm run format` - format backend TypeScript

### Frontend

- `npm run dev` - start the Vite dev server
- `npm run build` - type-check and build for production
- `npm run preview` - preview the production build
- `npm run lint` - lint the frontend source
- `npm run format` - format frontend source
- `npm run format:check` - verify formatting without writing changes

## Deployment Notes

- The backend is set up to run from a compiled `dist/main.js` entrypoint in production.
- Uploaded files are served from the local `uploads` directory, with optional fallback to a remote uploads origin.
- The provided backend `docker-compose.yaml` is configured for a containerized deployment that mounts `.env`, `firebase.json`, `uploads`, and `secrets` into the container.

## API Documentation

The backend exposes Swagger documentation and tags for:

- authentication
- users
- events
- notifications

That documentation is generated from the NestJS controllers and DTOs, so it stays close to the actual request and response shapes.

## Notes On Notifications

Push notifications rely on Firebase Admin credentials at the backend root:

- if `firebase.json` exists, the server initializes Firebase Admin on startup
- if it is missing, notification delivery is skipped gracefully

The frontend registers for notifications through Firebase Messaging and stores local notification preferences on the device.

## Notes On Storage

- Profile images and chat media are stored under `uploads/`
- The backend can redirect file requests to a remote uploads origin
- The frontend caches some weather and geolocation data locally for smoother repeat visits
