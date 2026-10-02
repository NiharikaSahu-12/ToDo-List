import type { RequestHandler } from "./$types";
import type { User } from "@supabase/supabase-js";
import type { z } from "zod";
import {
  aiErrorResponse,
  jsonRequest,
  requireAiUser,
  streamAssistant,
} from "$lib/server/ai/service";
import { aiChatInputSchema } from "$lib/schemas/tasks";

export const POST: RequestHandler = async ({ request, locals }) => {
  let user: User;
  let chat: z.infer<typeof aiChatInputSchema>;
  try {
    user = requireAiUser(locals.user);
    const parsed = aiChatInputSchema.safeParse(await jsonRequest(request));
    if (!parsed.success)
      return Response.json(
        { error: "Chat request is invalid." },
        { status: 400 },
      );
    chat = parsed.data;
  } catch (error) {
    return aiErrorResponse(error);
  }

  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (value: object) => {
        if (!cancelled)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(value)}\n\n`),
          );
      };
      void streamAssistant(
        locals.supabase,
        user,
        chat,
        (text) => send({ text }),
        request.signal,
      )
        .then(() => {
          if (cancelled) return;
          send({ done: true });
          controller.close();
        })
        .catch(async (error: unknown) => {
          if (cancelled) return;
          const response = aiErrorResponse(error);
          const body = await response.json();
          send({
            error:
              body.error ?? "The AI assistant could not complete that request.",
          });
          controller.close();
        });
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
};
