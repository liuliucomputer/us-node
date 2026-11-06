#!/bin/sh
set -e

# UUID 从平台环境变量注入（Render Dashboard -> Environment 里设置）
if [ -z "$UUID" ]; then
  UUID="$(cat /proc/sys/kernel/random/uuid)"
  echo "=================================================="
  echo "WARNING: UUID env not set, generated a temporary one:"
  echo "UUID=$UUID"
  echo "=================================================="
fi
WS_PATH="${WS_PATH:-/api/v2/stream}"
PORT="${PORT:-7860}"

mkdir -p /etc/sing-box
cat > /etc/sing-box/config.json <<EOF
{
  "log": { "level": "info" },
  "inbounds": [
    {
      "type": "vless",
      "tag": "vless-ws-in",
      "listen": "0.0.0.0",
      "listen_port": ${PORT},
      "users": [ { "uuid": "${UUID}" } ],
      "transport": { "type": "ws", "path": "${WS_PATH}" }
    }
  ],
  "outbounds": [ { "type": "direct", "tag": "direct" } ]
}
EOF

echo "sing-box starting: vless+ws on :${PORT}, path ${WS_PATH}"
exec sing-box run -c /etc/sing-box/config.json
