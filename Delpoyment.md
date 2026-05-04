• 下面按 Ubuntu/Debian 服务器 来讲，目标是：

  Android APK
    -> http://121.196.165.152
    -> Nginx
    -> FastAPI:127.0.0.1:8000
    -> PostgreSQL:127.0.0.1:5432

  PostgreSQL 不需要暴露公网，手机只访问后端 API。

  一、后端部署

  1. 登录服务器：

  ssh root@121.196.165.152

  2. 安装基础环境：

  apt update
  apt install -y python3 python3-venv python3-pip postgresql postgresql-contrib nginx git

  3. 创建数据库和用户：

  sudo -u postgres psql

  进入 psql 后执行：

  CREATE USER coupleloc WITH PASSWORD '换成一个强密码';
  CREATE DATABASE coupleloc OWNER coupleloc;
  \q

  4. 上传代码到服务器。

  如果你没有 Git 仓库，可以在 Windows 本机执行：

  ssh root@121.196.165.152 "mkdir -p /opt/coupleloc"
  scp -r D:\AFrontend\CoupleLoc\server root@121.196.165.152:/opt/coupleloc/

  服务器上目录应该是：

  /opt/coupleloc/server

  5. 安装 Python 依赖：

  cd /opt/coupleloc/server
  python3 -m venv .venv
  source .venv/bin/activate
  pip install --upgrade pip
  pip install -e .

  6. 配置 /opt/coupleloc/server/.env：

  APP_NAME=CoupleLoc API
  ENVIRONMENT=production
  DEBUG=false

  JWT_SECRET_KEY=换成至少32位以上随机字符串
  JWT_ALGORITHM=HS256
  ACCESS_TOKEN_EXPIRE_MINUTES=43200

  DATABASE_URL=postgresql+asyncpg://coupleloc:你的数据库密码@127.0.0.1:5432/coupleloc
  AUTO_CREATE_TABLES=false
  LOW_BATTERY_THRESHOLD=0.2

  SMS_PROVIDER=aliyun
  SMS_CODE_EXPIRE_MINUTES=5
  SMS_RESEND_COOLDOWN_SECONDS=60
  SMS_SIGN_NAME=速通互联验证码
  SMS_TEMPLATE_CODE=100001
  SMS_TEMPLATE_CODE_KEY=code
  ALIYUN_SMS_ENDPOINT=dypnsapi.aliyuncs.com
  ALIYUN_ACCESS_KEY_ID=你的阿里云AccessKeyId
  ALIYUN_ACCESS_KEY_SECRET=你的阿里云AccessKeySecret
  ALIYUN_STS_ENDPOINT=sts.cn-shanghai.aliyuncs.com

  CORS_ORIGINS=*

  你之前把阿里云 AK/SK 发出来过，正式部署前建议在阿里云控制台轮换一次密钥，然后只放到服务器 .env，不要提交到 Git。

  7. 执行数据库迁移：

  cd /opt/coupleloc/server
  source .venv/bin/activate
  alembic upgrade head

  8. 先临时启动测试：

  uvicorn app.main:app --host 0.0.0.0 --port 8000

  另开一个 SSH 窗口测试：

  curl http://127.0.0.1:8000/health

  如果你开放了安全组 8000，也可以在本机访问：

  http://121.196.165.152:8000/health

  9. 配置 systemd 后台服务：

  nano /etc/systemd/system/coupleloc.service

  写入：

  [Unit]
  Description=CoupleLoc FastAPI
  After=network.target postgresql.service

  [Service]
  WorkingDirectory=/opt/coupleloc/server
  EnvironmentFile=/opt/coupleloc/server/.env
  ExecStart=/opt/coupleloc/server/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --proxy-headers
  Restart=always
  RestartSec=3

  [Install]
  WantedBy=multi-user.target

  启动：

  systemctl daemon-reload
  systemctl enable --now coupleloc
  systemctl status coupleloc

  查看日志：

  journalctl -u coupleloc -f

  10. 配置 Nginx 反向代理：

  nano /etc/nginx/sites-available/coupleloc

  写入：

  server {
      listen 80;
      server_name 121.196.165.152;

      location / {
          proxy_pass http://127.0.0.1:8000;
          proxy_http_version 1.1;

          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
          proxy_set_header X-Forwarded-Proto $scheme;

          proxy_set_header Upgrade $http_upgrade;
          proxy_set_header Connection "upgrade";
      }
  }

  启用：

  ln -s /etc/nginx/sites-available/coupleloc /etc/nginx/sites-enabled/coupleloc
  nginx -t
  systemctl reload nginx

  然后测试：

  http://121.196.165.152/health

  阿里云安全组至少开放：

  22/tcp   SSH
  80/tcp   HTTP API + WebSocket

  不要开放 5432 到公网。

  二、移动端打包 APK

  后端确认能访问后，修改 mobile/.env：

  EXPO_PUBLIC_API_BASE_URL=http://121.196.165.152
  EXPO_PUBLIC_WS_BASE_URL=ws://121.196.165.152
  EXPO_PUBLIC_AMAP_ANDROID_API_KEY=你的高德Android Key

  如果你不用 Nginx，而是直接开放 8000，则写：

  EXPO_PUBLIC_API_BASE_URL=http://121.196.165.152:8000
  EXPO_PUBLIC_WS_BASE_URL=ws://121.196.165.152:8000

  推荐先用本地 Gradle 打一个可安装 APK：

  cd D:\AFrontend\CoupleLoc\mobile
  npm install
  npm run typecheck
  cd android
  .\gradlew.bat assembleRelease

  生成文件一般在：

  D:\AFrontend\CoupleLoc\mobile\android\app\build\outputs\apk\release\app-release.apk

  当前项目的 release 仍使用 debug keystore 签名，适合你们两台手机测试安装，不适合正式上架。

  安装到连接电脑的手机：

  adb install -r .\app\build\outputs\apk\release\app-release.apk

  或者把 APK 发到手机上手动安装。

  还有一个云端打包方式：

  cd D:\AFrontend\CoupleLoc\mobile
  npm install -g eas-cli
  eas login
  eas build --profile preview --platform android

  你的 eas.json 里 preview 已经配置为 APK。注意 EAS 云端构建时也必须拿到 EXPO_PUBLIC_API_BASE_URL、EXPO_PUBLIC_WS_BASE_URL 和高德 Key，可以在
  EAS 环境变量里配置，或者临时写进 eas.json 的 env。

  最后重点检查高德地图：Android Key 通常绑定 包名 com.coupleloc.app + SHA1。如果本地 Gradle 和 EAS 使用不同签名证书，SHA1 不同，高德后台也要分
  别添加，否则 APK 能打开但地图可能不显示。



## 更新工作流
  ssh root@121.196.165.152
  cd /opt/coupleloc/server
  git pull
  source .venv/bin/activate
  pip install -e .
  alembic upgrade head
  systemctl restart coupleloc
  systemctl status coupleloc

    测试：

  curl http://127.0.0.1:8000/health
  curl http://121.196.165.152/health

  
  看日志：

  journalctl -u coupleloc -f