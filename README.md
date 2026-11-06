# US Node on Render (free)

sing-box VLESS + WebSocket，部署在 Render 免费 Web Service 上（区域选 Oregon = 美国西部）。

## 部署概要（详细步骤见聊天里 Muse 给的说明）

1. 把 `Dockerfile` 和 `entrypoint.sh` 放到一个 GitHub 公开仓库（代码里没有密钥）。
2. Render 里 New → Web Service → 选这个仓库，Runtime 选 Docker，
   Region 选 **Oregon (US West)**，Instance Type 选 **Free**。
3. 在 Environment 里加环境变量 `UUID`（值由 Muse 给你，不要写进代码）。
4. 部署完成后得到 `https://<名字>.onrender.com`，客户端参数：
   - VLESS + WS + TLS，地址 `<名字>.onrender.com`，端口 443
   - UUID 同上，WS 路径 `/api/v2/stream`，Host 头同地址

## 已知限制

- 免费实例闲置约 15 分钟会休眠，下次连接要等几十秒唤醒；
  Clash 的自动测速或定时 ping 可以保活，免费额度 750 小时/月够一台全月常开。
- 免费带宽 100GB/月，个人用足够。
