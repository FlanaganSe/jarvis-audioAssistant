import type { Config } from "../config.js";
import { toolRegistry } from "../services/tool-registry.js";
import { registerCapabilityTools } from "./capabilities.js";
import { registerGithubTools } from "./github.js";
import { registerMemoryTools } from "./memory.js";
import { registerPreferenceTools } from "./preferences.js";
import { registerWeatherTools } from "./weather.js";

export function registerAllTools(config: Config): void {
  registerGithubTools(toolRegistry, config);
  registerWeatherTools(toolRegistry, config);
  registerPreferenceTools(toolRegistry);
  registerMemoryTools(toolRegistry);
  registerCapabilityTools(toolRegistry);
}
