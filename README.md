# CoupleLoc

Private Android location sharing app for two people. The current local build
uses React Native + Expo, FastAPI, PostgreSQL, and AMap/Gaode for the map.

## Structure

- `mobile/`: React Native + Expo app.
- `server/`: FastAPI backend.
- `docs/database-design.md`: living database schema design.
- `docker-compose.yml`: optional local PostgreSQL through Docker.

## Backend

1. Configure the server:

```powershell
Copy-Item server\.env.example server\.env
```

Edit `server/.env` and make sure `DATABASE_URL` points to your local
PostgreSQL database. Set `JWT_SECRET_KEY` before anything beyond local testing.

2. Install and run:

```powershell
cd server
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

If you want Docker-managed PostgreSQL instead of a native Windows PostgreSQL
installation, run this from the repository root:

```powershell
docker compose up -d db
```

## Mobile

1. Configure the app:

```powershell
Copy-Item mobile\.env.example mobile\.env
```

When testing on a physical Android phone, use your computer LAN IP instead of
`127.0.0.1`.

Example:

```text
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.20:8000
EXPO_PUBLIC_WS_BASE_URL=ws://192.168.1.20:8000
EXPO_PUBLIC_AMAP_ANDROID_API_KEY=your-amap-android-key
```

For compatibility, the app also falls back to
`EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY`, but new local env files should use
`EXPO_PUBLIC_AMAP_ANDROID_API_KEY`.

2. Install and run:

```powershell
cd mobile
npm install
npx expo install --fix
npm run android
```

Background location and AMap native modules do not work correctly in Expo Go.
Use `npm run android` for a local development build or
`eas build --profile development --platform android` for an internal APK.

## Current Features

- Register/login.
- Pair two users through a 6-character invite code.
- Toggle location sharing.
- Upload latest location from foreground every 5-10 seconds or 10 meters.
- Upload latest location from background using Android foreground service,
  roughly every 1-5 minutes or 50 meters.
- Push partner location to the foreground app through WebSocket.
- Store only the latest location row per user.
- Send text chat messages and quick statuses.
- Add shared calendar events.
- Save shared map memory points.
- Show low battery realtime alerts based on `LOW_BATTERY_THRESHOLD`.

