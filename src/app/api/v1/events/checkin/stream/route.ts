import { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/session";
import { checkInEmitter, type CheckInEvent } from "@/lib/checkInEmitter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const seriesId  = searchParams.get("seriesId")  ?? null;
  const sessionId = searchParams.get("sessionId") ?? null;
  const userId    = searchParams.get("userId")    ?? null;

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (text: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(text)); } catch {}
      };

      send(": connected\n\n");

      const onEvent = (event: CheckInEvent) => {
        if (closed) return;
        if (seriesId  && event.seriesId  !== seriesId)  return;
        if (sessionId && event.sessionId !== sessionId) return;
        if (userId    && event.userId    !== userId)    return;
        send(`data: ${JSON.stringify(event)}\n\n`);
      };

      checkInEmitter.on("ticket-checked-in", onEvent);

      const heartbeat = setInterval(() => {
        if (closed) { clearInterval(heartbeat); return; }
        send(": heartbeat\n\n");
      }, 25000);

      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(heartbeat);
        checkInEmitter.off("ticket-checked-in", onEvent);
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
