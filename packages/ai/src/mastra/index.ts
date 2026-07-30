import { Mastra } from "@mastra/core/mastra";
import { financialAgent } from "./agents/financial-agent";

export const mastra = new Mastra({
  agents: { financialAgent },
});
