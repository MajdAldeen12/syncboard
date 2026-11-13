import { routePartykitRequest } from "partyserver";

export { BoardRoom } from "./board-room";

export default {
  async fetch(request, env) {
    // For "is the server up" checks, without waking any board.
    if (new URL(request.url).pathname === "/health") {
      return new Response("ok");
    }

    const response = await routePartykitRequest(request, env);
    return response ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
