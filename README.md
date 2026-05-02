# CoupleLoc

异地恋双人定位 App，第一版只支持 Android，保存双方的最新位置，不保存历史轨迹。

## Structure

- `mobile/`: React Native + Expo app.
- `server/`: FastAPI backend.
- `docs/database-design.md`: living database schema design.
- `docker-compose.yml`: local PostgreSQL.

## Backend

1. Start PostgreSQL:

```powershell
docker compose up -d db
```

2. Configure the server:

```powershell
Copy-Item server\.env.example server\.env
```

Edit `server/.env` and set `JWT_SECRET_KEY` before anything beyond local testing.

3. Install and run:

```powershell
cd server
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

For quick local prototyping you can set `AUTO_CREATE_TABLES=true`, but migrations are the cleaner path.

## Mobile

1. Configure the app:

```powershell
Copy-Item mobile\.env.example mobile\.env
```

When testing on a physical Android phone, use your computer LAN IP instead of `127.0.0.1`.

Example:

```text
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.20:8000
EXPO_PUBLIC_WS_BASE_URL=ws://192.168.1.20:8000
```

2. Install and run:

```powershell
cd mobile
npm install
npx expo install --fix
npm run android
```

Background location does not work correctly in Expo Go. Use `npm run android` for a local development build or `eas build --profile development --platform android` for an internal APK.

`react-native-maps` needs a Google Maps Android API key for standalone Android builds. Put it in `mobile/.env`:

```text
EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY=your-key
```

## First MVP

- Register/login.
- Pair two users through a 6-character invite code.
- Toggle location sharing.
- Upload latest location from foreground every 5-10 seconds or 10 meters.
- Upload latest location from background using Android foreground service, roughly every 1-5 minutes or 50 meters.
- Push partner location to the foreground app through WebSocket.
- Store only the latest location row per user.
- Send text chat messages and quick statuses.
- Add shared calendar events.
- Save shared map memory points.
- Show low battery realtime alerts based on `LOW_BATTERY_THRESHOLD`.
