import type { Config } from "../config.js";
import { toolRegistry } from "../services/tool-registry.js";
import { registerGithubTools } from "./github.js";
import { registerWeatherTools } from "./weather.js";

export function registerAllTools(config: Config): void {
  registerGithubTools(toolRegistry, config);
  registerWeatherTools(toolRegistry, config);
}
