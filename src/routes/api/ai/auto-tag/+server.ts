import type { RequestHandler } from "./$types";
import { aiJsonEndpoint } from "$lib/server/ai/endpoint";
import { aiPrompts } from "$lib/server/ai/service";
import {
  aiAutoTagInputSchema,
  aiAutoTagOutputSchema,
} from "$lib/schemas/tasks";

export const POST: RequestHandler = aiJsonEndpoint({
  feature: "auto-tag",
  inputSchema: aiAutoTagInputSchema,
  outputSchema: aiAutoTagOutputSchema,
  maxTokens: 1600,
  prompt: ({ tasks }) => aiPrompts.autoTag(tasks),
});
