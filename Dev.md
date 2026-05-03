### 启动PostgreSQL
  docker compose up -d db
  docker compose ps

  看到 coupleloc-postgres 是 running/healthy 即可。

### 配置并启动后端
Copy-Item server\.env.example server\.env    #即创建env环境变量文件
本次测试保持：
```
  DATABASE_URL=postgresql+asyncpg://coupleloc:coupleloc@localhost:5432/coupleloc
  AUTO_CREATE_TABLES=false
  LOW_BATTERY_THRESHOLD=0.2
  CORS_ORIGINS=*

```
```bash
  cd server
  python -m venv .venv
  .\.venv\Scripts\Activate.ps1
  python -m pip install --upgrade pip
  pip install -e ".[dev]"
  python -m alembic upgrade head
  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

```

  启动后检查：

  http://127.0.0.1:8000/health
  http://127.0.0.1:8000/docs


### 启动移动端
  cd D:\AFrontend\CoupleLoc
  Copy-Item mobile\.env.example mobile\.env
  如果你用 Android 模拟器，mobile\.env 写：

  EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8000
  EXPO_PUBLIC_WS_BASE_URL=ws://10.0.2.2:8000
  EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY=你的GoogleMapsKey

  如果你用真机，先查电脑局域网 IP：

  ipconfig

  找到 Wi-Fi 或以太网的 IPv4，比如 192.168.1.20，然后写：

  EXPO_PUBLIC_API_BASE_URL=http://192.168.1.20:8000
  EXPO_PUBLIC_WS_BASE_URL=ws://192.168.1.20:8000
  EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY=你的GoogleMapsKey

  真机不能用 127.0.0.1，那指的是手机自己。

   cd mobile
  npm install
  npx expo install --fix
  npm run android

  npm run android 会生成 development build，并安装到模拟器/真机。第一次会比较慢。