import type { RequestHandler } from "./$types";
import { aiJsonEndpoint } from "$lib/server/ai/endpoint";
import { aiPrompts } from "$lib/server/ai/service";
import {
  aiBreakdownInputSchema,
  aiBreakdownOutputSchema,
} from "$lib/schemas/tasks";

export const POST: RequestHandler = aiJsonEndpoint({
  feature: "breakdown",
  inputSchema: aiBreakdownInputSchema,
  outputSchema: aiBreakdownOutputSchema,
  prompt: (task) => aiPrompts.breakdown(task),
});
