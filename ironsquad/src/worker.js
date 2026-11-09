// Iron Squad co-op relay.
// Serves the game from /public and pairs two phones by a 4-character room code.
// The host's phone runs the game; this worker only forwards messages between the two.
import { DurableObject } from 'cloudflare:workers';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/ping') {
      return Response.json({ game: 'ironsquad' }, { headers: { 'cache-control': 'no-store' } });
    }
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected a WebSocket connection', { status: 426 });
      }
      const room = (url.searchParams.get('room') || '').toUpperCase();
      if (!/^[A-Z0-9]{4}$/.test(room)) return new Response('Invalid room code', { status: 400 });
      const stub = env.ROOMS.get(env.ROOMS.idFromName(room));
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

// One Durable Object per room code. Holds at most one host and one guest socket.
export class Room extends DurableObject {
  async fetch(request) {
    const role = new URL(request.url).searchParams.get('role') === 'host' ? 'host' : 'guest';
    const [client, server] = Object.values(new WebSocketPair());
    const hosts = this.ctx.getWebSockets('host');
    const guests = this.ctx.getWebSockets('guest');

    let error = null;
    if (role === 'host' && hosts.length) error = 'taken';
    if (role === 'guest' && !hosts.length) error = 'nohost';
    if (role === 'guest' && guests.length) error = 'full';

    if (error) {
      // Rejected sockets are not attached to the room, so they never trigger "player left".
      server.accept();
      server.send(JSON.stringify({ t: 'err', e: error }));
      server.close(4000, error);
      return new Response(null, { status: 101, webSocket: client });
    }

    this.ctx.acceptWebSocket(server, [role]);
    server.send(JSON.stringify({ t: 'ok', role }));
    if (role === 'guest') this.broadcast('host', { t: 'peer-joined' });
    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast(tag, msg, except) {
    const text = typeof msg === 'string' ? msg : JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets(tag)) {
      if (ws === except) continue;
      try { ws.send(text); } catch (e) {}
    }
  }

  webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > 65536) return;
    const [role] = this.ctx.getTags(ws);
    this.broadcast(role === 'host' ? 'guest' : 'host', message);
  }

  webSocketClose(ws, code) {
    const [role] = this.ctx.getTags(ws);
    if (role === 'host') this.broadcast('guest', { t: 'host-left' }, ws);
    else this.broadcast('host', { t: 'peer-left' }, ws);
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye'); } catch (e) {}
  }

  webSocketError(ws) {
    this.webSocketClose(ws, 1011);
  }
}
