import type { ToolRegistry } from "../services/tool-registry.js";
import type { ToolResult } from "./types.js";

function createJarvisCapabilities(registry: ToolRegistry) {
  return {
    name: "jarvis_capabilities",
    description: "Describe Jarvis's current capabilities, integrations, and limitations",
    parameters: { type: "object", properties: {} },
    async execute(_args: Record<string, unknown>, _context: unknown): Promise<ToolResult> {
      const tools = registry.getAll();
      const toolSummaries = tools
        .filter((t) => t.name !== "jarvis_capabilities")
        .map((t) => ({ name: t.name, description: t.description }));

      const capabilities = {
        tools: toolSummaries,
        integrations: [
          {
            name: "GitHub",
            access: "Public repos, read-only via PAT",
            tools: [
              "github_list_open_prs",
              "github_get_pr_details",
              "github_list_issues",
              "github_get_issue_details",
              "github_get_recent_merges",
              "github_repo_briefing",
              "github_repo_changes",
              "github_propose_action",
            ],
          },
          {
            name: "OpenWeatherMap",
            access: "Current conditions worldwide",
            tools: ["weather_get_current"],
          },
        ],
        features: [
          "Cross-session memory — I can recall what we discussed in past conversations",
          "User preferences — I remember standing instructions you set",
          "Grounded answers — every data point comes from a live API with evidence and freshness tracking",
          "Repo briefings — comprehensive snapshot of any GitHub repo in 15 seconds",
          "What changed — shows what's new since your last conversation about a repo",
          "Action proposals — I can analyze issues and propose fix plans, PR outlines, or comment drafts (requires your approval to execute)",
        ],
        limitations: [
          "Read-only — I cannot create PRs, post comments, merge branches, or modify any external system",
          "Proposals require your approval — I plan, you decide",
          "Weather data has a 3-minute freshness window",
          "English only",
          "No email, Slack, calendar, or file system access",
        ],
        coming_soon: [
          "Connected GitHub workspaces for your team's repos",
          "Approval workflows — execute proposals with one click",
          "Slack and calendar integration",
        ],
      };

      return {
        output: JSON.stringify(capabilities),
        evidence: null,
      };
    },
  };
}

export function registerCapabilityTools(registry: ToolRegistry): void {
  registry.register(createJarvisCapabilities(registry));
}
