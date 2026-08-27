var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-xmKgLp/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// .wrangler/tmp/bundle-xmKgLp/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader.apply(null, argArray)
    ]);
  }
});

// src/index.js
var NOT_FOUND_PAGE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>404</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#111;color:#888;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center}
.code{font-size:90px;font-weight:800;color:#444;line-height:1}
.desc{font-size:16px;margin-top:16px;color:#666}
</style>
</head>
<body>
<div class="code">404</div>
<div class="desc">\u9875\u9762\u65E0\u6CD5\u8BBF\u95EE</div>
</body>
</html>`;
var ChatRoom = class {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.ctx = state.storage;
    this.db = state.storage.sqlite;
    this.clients = /* @__PURE__ */ new Set();
    this.messages = [];
    this.initDb();
  }
  initDb() {
    this.db.exec("CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, time INTEGER NOT NULL, data TEXT NOT NULL)");
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_messages_time ON messages(time)");
  }
  // 加载最近 24 小时的消息（逐条存，按时间升序）
  async loadState() {
    const cutoff = Date.now() - 864e5;
    const rows = this.db.prepare("SELECT data FROM messages WHERE time >= ? ORDER BY time ASC").bind(cutoff).all();
    this.messages = rows.map((r) => JSON.parse(r.data));
  }
  // 持久化一条新消息，并清理 24 小时前的旧消息
  persistMessage(msg) {
    this.db.prepare("INSERT OR REPLACE INTO messages (id, time, data) VALUES (?, ?, ?)").run(msg.id, msg.time, JSON.stringify(msg));
    const cutoff = Date.now() - 864e5;
    this.db.prepare("DELETE FROM messages WHERE time < ?").run(cutoff);
  }
  touch() {
  }
  isExpired() {
    return false;
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      return this.handleWebSocket(request);
    }
    await this.loadState();
    if (this.isExpired()) {
      return new Response(NOT_FOUND_PAGE, {
        status: 404,
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    }
    this.touch();
    return this.env.ASSETS.fetch(request);
  }
  handleWebSocket(request) {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.clients.add(server);
    server.accept();
    this.loadState();
    server.addEventListener("message", (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data.type === "join") {
        this.touch();
        const roomId = String(data.roomId || "default").trim().slice(0, 32);
        const name = String(data.name || "\u7528\u6237").trim().slice(0, 20) || "\u7528\u6237";
        server._roomName = name;
        this.sendTo(server, {
          type: "joined",
          roomId,
          name,
          history: this.messages.slice(-50),
          onlineCount: this.clients.size
        });
        this.broadcast({ type: "system", message: name + " \u8FDB\u5165\u4E86\u623F\u95F4", time: Date.now() }, server);
        this.updateOnline();
      }
      if (data.type === "ping") {
        this.touch();
        this.sendTo(server, { type: "pong", time: Date.now() });
      }
      if (data.type === "chat") {
        const text = String(data.text || "").trim().slice(0, 2e3);
        const img = data.img ? String(data.img).slice(0, 2e6) : null;
        if (!text && !img)
          return;
        const msg = {
          type: "chat",
          name: server._roomName || "\u7528\u6237",
          text,
          img,
          time: Date.now(),
          id: crypto.randomUUID()
        };
        this.persistMessage(msg);
        this.messages.push(msg);
        this.broadcast(msg);
      }
      if (data.type === "rename") {
        const newName = String(data.name || "").trim().slice(0, 20);
        if (newName) {
          const oldName = server._roomName;
          server._roomName = newName;
          this.broadcast({ type: "system", message: oldName + " \u6539\u540D\u4E3A " + newName, time: Date.now() });
        }
      }
      if (data.type === "status") {
        const name = String(data.name || server._roomName || "").slice(0, 20);
        const device = data.device === "mobile" ? "mobile" : "desktop";
        const visible = !!data.visible;
        this.broadcast({ type: "status", name, device, visible });
      }
      if (data.type === "list") {
        const names = [];
        for (const c of this.clients) {
          if (c._roomName)
            names.push(c._roomName);
        }
        this.sendTo(server, { type: "userList", names });
      }
      if (data.type === "leave") {
        this.removeClient(server);
      }
    });
    server.addEventListener("close", () => this.removeClient(server));
    server.addEventListener("error", () => this.removeClient(server));
    return new Response(null, { status: 101, webSocket: client });
  }
  sendTo(ws, data) {
    try {
      ws.send(JSON.stringify(data));
    } catch {
    }
  }
  broadcast(msg, exclude) {
    const json = JSON.stringify(msg);
    for (const c of this.clients) {
      if (c !== exclude) {
        try {
          c.send(json);
        } catch {
        }
      }
    }
  }
  updateOnline() {
    const json = JSON.stringify({ type: "onlineCount", count: this.clients.size });
    for (const c of this.clients) {
      try {
        c.send(json);
      } catch {
      }
    }
  }
  removeClient(server) {
    const name = server._roomName;
    this.clients.delete(server);
    if (name) {
      this.broadcast({ type: "system", message: name + " \u79BB\u5F00\u4E86\u623F\u95F4", time: Date.now() }, server);
      this.broadcast({ type: "left", name });
    }
    this.updateOnline();
  }
};
__name(ChatRoom, "ChatRoom");
var src_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }
    if (url.pathname === "/ws") {
      const roomId = url.searchParams.get("room") || "default";
      const safeRoom = roomId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32) || "default";
      const stub = env.ROOM.idFromName(safeRoom);
      const room = env.ROOM.get(stub);
      return room.fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-xmKgLp/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-xmKgLp/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  ChatRoom,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
