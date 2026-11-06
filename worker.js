// VLESS + WebSocket 节点（Cloudflare Workers）
// 部署后在 Settings -> Variables 里加变量 UUID（值用 Muse 给你的那个）。
// 客户端：VLESS / WS / TLS，地址 = 你的 workers.dev 域名，端口 443，路径 /api/v2/stream
import { connect } from "cloudflare:sockets";

const WS_PATH = "/api/v2/stream";

function uuidToBytes(uuid) {
  const hex = uuid.replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// 解析 VLESS 请求头，返回 { version, address, port, payloadOffset, isUDP } 或 null
function parseVlessHeader(buf, expectedUuidBytes) {
  if (buf.length < 24) return null;
  const version = buf[0];
  if (!bytesEqual(buf.slice(1, 17), expectedUuidBytes)) return null;
  let idx = 17;
  const addonLen = buf[idx];
  idx += 1 + addonLen;
  const command = buf[idx]; idx += 1; // 1=TCP, 2=UDP
  const port = (buf[idx] << 8) | buf[idx + 1]; idx += 2;
  const addrType = buf[idx]; idx += 1;
  let address = "";
  if (addrType === 1) {
    address = Array.from(buf.slice(idx, idx + 4)).join(".");
    idx += 4;
  } else if (addrType === 2) {
    const len = buf[idx]; idx += 1;
    address = new TextDecoder().decode(buf.slice(idx, idx + len));
    idx += len;
  } else if (addrType === 3) {
    const parts = [];
    for (let i = 0; i < 8; i++) {
      parts.push(((buf[idx + i * 2] << 8) | buf[idx + i * 2 + 1]).toString(16));
    }
    address = parts.join(":");
    idx += 16;
  } else {
    return null;
  }
  return { version, address, port, payloadOffset: idx, isUDP: command === 2 };
}

function base64ToBytes(b64) {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const upgrade = request.headers.get("Upgrade");
    if (!upgrade || upgrade.toLowerCase() !== "websocket" || url.pathname !== WS_PATH) {
      return new Response("ok", { status: 200 });
    }
    const uuid = env.UUID;
    if (!uuid) return new Response("UUID not configured", { status: 500 });
    const expectedUuid = uuidToBytes(uuid);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    let remoteSocket = null;
    let writer = null;
    let headerConsumed = false;
    let responseHeaderSent = false;
    const earlyData = request.headers.get("sec-websocket-protocol");

    const enqueueFromWs = async (chunk) => {
      if (!headerConsumed) {
        const parsed = parseVlessHeader(chunk, expectedUuid);
        if (!parsed || parsed.isUDP) { server.close(1008); return; }
        headerConsumed = true;
        remoteSocket = connect({ hostname: parsed.address, port: parsed.port });
        writer = remoteSocket.writable.getWriter();
        const rest = chunk.slice(parsed.payloadOffset);
        if (rest.length) await writer.write(rest);
        // 把远端数据回传给 WS 客户端，第一帧带上 VLESS 响应头
        (async () => {
          const reader = remoteSocket.readable.getReader();
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              if (!responseHeaderSent) {
                responseHeaderSent = true;
                const out = new Uint8Array(value.length + 2);
                out[0] = parsed.version; out[1] = 0;
                out.set(value, 2);
                server.send(out);
              } else {
                server.send(value);
              }
            }
          } catch (_) { /* ignore */ }
          try { server.close(); } catch (_) {}
        })();
      } else if (writer) {
        await writer.write(chunk);
      }
    };

    server.addEventListener("message", (event) => {
      const data = event.data instanceof ArrayBuffer
        ? new Uint8Array(event.data)
        : new Uint8Array(event.data);
      enqueueFromWs(data).catch(() => { try { server.close(1011); } catch (_) {} });
    });
    server.addEventListener("close", () => {
      try { remoteSocket && remoteSocket.close(); } catch (_) {}
    });
    server.addEventListener("error", () => {
      try { remoteSocket && remoteSocket.close(); } catch (_) {}
    });

    if (earlyData) {
      try {
        enqueueFromWs(base64ToBytes(earlyData)).catch(() => {});
      } catch (_) { /* ignore bad early data */ }
    }

    return new Response(null, { status: 101, webSocket: client });
  },
};

// 供本地测试用（部署时无副作用）
export { parseVlessHeader, uuidToBytes };
