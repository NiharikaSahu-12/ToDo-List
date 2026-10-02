import type { RequestHandler } from "./$types";
import { aiJsonEndpoint } from "$lib/server/ai/endpoint";
import { aiPrompts } from "$lib/server/ai/service";
import {
  aiSummaryInputSchema,
  aiSummaryOutputSchema,
} from "$lib/schemas/tasks";

export const POST: RequestHandler = aiJsonEndpoint({
  feature: "summary",
  inputSchema: aiSummaryInputSchema,
  outputSchema: aiSummaryOutputSchema,
  maxTokens: 1400,
  prompt: ({ range, tasks }) => aiPrompts.summary(range, tasks),
});
