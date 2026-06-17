import { anthropic } from "@ai-sdk/anthropic";
import { defineAgent } from "eve";

// Primary model: claude-haiku-4-5 (fast + cheap for implementation tasks).
// If haiku errors at runtime, swap to claude-sonnet-4-6.
export default defineAgent({
  model: anthropic("claude-haiku-4-5"),
});
