import type { Config } from "../config.js";
import { toolRegistry } from "../services/tool-registry.js";
import { registerCapabilityTools } from "./capabilities.js";
import { registerBriefingTools } from "./github-briefing.js";
import { registerChangesTools } from "./github-changes.js";
import { registerProposalTools } from "./github-proposals.js";
import { registerGithubTools } from "./github.js";
import { registerMemoryTools } from "./memory.js";
import { registerPreferenceTools } from "./preferences.js";
import { registerWeatherTools } from "./weather.js";

export function registerAllTools(config: Config): void {
  registerGithubTools(toolRegistry, config);
  registerBriefingTools(toolRegistry, config);
  registerChangesTools(toolRegistry, config);
  registerProposalTools(toolRegistry, config);
  registerWeatherTools(toolRegistry, config);
  registerPreferenceTools(toolRegistry);
  registerMemoryTools(toolRegistry);
  registerCapabilityTools(toolRegistry);
}
