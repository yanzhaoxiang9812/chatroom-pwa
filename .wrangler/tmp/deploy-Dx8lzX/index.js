var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var ChatRoom = class {
  constructor(state, env2) {
    this.state = state;
    this.env = env2;
    this.ctx = state.storage;
    this.clients = /* @__PURE__ */ new Set();
    this.messages = [];
    this.lastActive = Date.now();
  }
  async loadState() {
    const data = await this.ctx.get("state");
    if (data) {
      this.messages = data.messages || [];
      this.lastActive = data.lastActive || Date.now();
      const cutoff = Date.now() - 864e5;
      this.messages = this.messages.filter((m) => m.time >= cutoff);
    }
  }
  async saveState() {
    const cutoff = Date.now() - 864e5;
    this.messages = this.messages.filter((m) => m.time >= cutoff);
    if (this.messages.length > 200)
      this.messages = this.messages.slice(-200);
    await this.ctx.put("state", { messages: this.messages, lastActive: this.lastActive });
  }
  touch() {
    this.lastActive = Date.now();
    this.saveState();
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      return this.handleWebSocket(request);
    }
    await this.loadState();
    this.touch();
    return env.ASSETS.fetch(request);
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
        this.broadcast({ type: "system", message: name + " \u52A0\u5165\u4E86\u623F\u95F4", time: Date.now() }, server);
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
        this.saveState();
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
  async fetch(request, env2) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }
    if (url.pathname === "/ws") {
      const roomId = url.searchParams.get("room") || "default";
      const safeRoom = roomId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32) || "default";
      const stub = env2.ROOM.idFromName(safeRoom);
      const room = env2.ROOM.get(stub);
      return room.fetch(request);
    }
    return env2.ASSETS.fetch(request);
  }
};
export {
  ChatRoom,
  src_default as default
};
//# sourceMappingURL=index.js.map
