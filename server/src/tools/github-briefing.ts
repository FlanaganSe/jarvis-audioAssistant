import { Octokit } from "@octokit/rest";
import type { Config } from "../config.js";
import type { ToolRegistry } from "../services/tool-registry.js";
import type { ToolDefinition, ToolResult } from "./types.js";

function createRepoBriefing(octokit: Octokit): ToolDefinition {
  return {
    name: "github_repo_briefing",
    description:
      "Get a comprehensive status briefing for a GitHub repository: open PRs, open issues, recent merges, and repo metadata. Use when the user asks for a repo overview, status summary, or briefing.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
      },
      required: ["owner", "repo"],
    },
    async execute(args, _context): Promise<ToolResult> {
      const owner = args.owner as string;
      const repo = args.repo as string;

      try {
        const [openPrs, openIssues, closedPrs, repoMeta] = await Promise.all([
          octokit.pulls
            .list({ owner, repo, state: "open", per_page: 5, sort: "created", direction: "desc" })
            .catch(() => ({ data: [] })),
          octokit.issues
            .listForRepo({
              owner,
              repo,
              state: "open",
              per_page: 5,
              sort: "created",
              direction: "desc",
            })
            .catch(() => ({ data: [] })),
          octokit.pulls
            .list({
              owner,
              repo,
              state: "closed",
              sort: "updated",
              direction: "desc",
              per_page: 10,
            })
            .catch(() => ({ data: [] })),
          octokit.repos.get({ owner, repo }).catch(() => null),
        ]);

        const mergedPrs = closedPrs.data.filter((pr) => pr.merged_at !== null).slice(0, 5);
        const issuesOnly = openIssues.data.filter((item) => !item.pull_request);

        const snapshot = {
          repo: `${owner}/${repo}`,
          description: repoMeta?.data.description ?? null,
          stars: repoMeta?.data.stargazers_count ?? null,
          forks: repoMeta?.data.forks_count ?? null,
          open_prs: {
            count_shown: openPrs.data.length,
            notable: openPrs.data.map((pr) => ({
              number: pr.number,
              title: pr.title,
              author: pr.user?.login ?? "unknown",
            })),
          },
          open_issues: {
            total: repoMeta?.data.open_issues_count ?? null,
            count_shown: issuesOnly.length,
            notable: issuesOnly.map((issue) => ({
              number: issue.number,
              title: issue.title,
              labels: issue.labels.map((l) => (typeof l === "string" ? l : l.name)),
            })),
          },
          recent_merges: {
            count_shown: mergedPrs.length,
            items: mergedPrs.map((pr) => ({
              number: pr.number,
              title: pr.title,
              author: pr.user?.login ?? "unknown",
              merged_at: pr.merged_at,
            })),
          },
          snapshot_at: new Date().toISOString(),
        };

        return {
          output: JSON.stringify(snapshot),
          evidence: {
            source: "github",
            entity: `repo:${owner}/${repo}`,
            fetchedAt: new Date().toISOString(),
            freshnessSec: 0,
            citationRef: "GitHub API (aggregated)",
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown GitHub API error";
        return { output: JSON.stringify({ error: message }), evidence: null };
      }
    },
  };
}

export function registerBriefingTools(registry: ToolRegistry, config: Config): void {
  const octokit = new Octokit({ auth: config.githubToken });
  registry.register(createRepoBriefing(octokit));
}
