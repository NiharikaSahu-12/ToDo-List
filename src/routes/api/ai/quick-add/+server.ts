import type { RequestHandler } from "./$types";
import { aiJsonEndpoint } from "$lib/server/ai/endpoint";
import { aiPrompts } from "$lib/server/ai/service";
import {
  aiQuickAddInputSchema,
  aiQuickAddOutputSchema,
} from "$lib/schemas/tasks";

export const POST: RequestHandler = aiJsonEndpoint({
  feature: "quick-add",
  inputSchema: aiQuickAddInputSchema,
  outputSchema: aiQuickAddOutputSchema,
  prompt: (input) => aiPrompts.quickAdd(input),
});
