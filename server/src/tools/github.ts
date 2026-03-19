import { Octokit } from "@octokit/rest";
import type { Config } from "../config.js";
import type { ToolRegistry } from "../services/tool-registry.js";
import type { ToolDefinition, ToolResult } from "./types.js";

function makeEvidence(owner: string, repo: string): ToolResult["evidence"] {
  return {
    source: "github",
    entity: `repo:${owner}/${repo}`,
    fetchedAt: new Date().toISOString(),
    freshnessSec: 0,
    citationRef: "GitHub API",
  };
}

function handleOctokitError(err: unknown): ToolResult {
  if (err instanceof Error && "status" in err) {
    const status = (err as { status: number }).status;
    if (status === 404) {
      return {
        output: JSON.stringify({ error: "Repository or resource not found" }),
        evidence: null,
      };
    }
    if (status === 403) {
      const resetHeader = (err as { response?: { headers?: Record<string, string> } }).response
        ?.headers?.["x-ratelimit-reset"];
      if (resetHeader) {
        const resetTime = new Date(Number(resetHeader) * 1000);
        return {
          output: JSON.stringify({
            error: `GitHub rate limit reached — try again after ${resetTime.toLocaleTimeString()}`,
          }),
          evidence: null,
        };
      }
      return { output: JSON.stringify({ error: "GitHub API access forbidden" }), evidence: null };
    }
  }
  const message = err instanceof Error ? err.message : "Unknown GitHub API error";
  return { output: JSON.stringify({ error: message }), evidence: null };
}

function createListOpenPrs(octokit: Octokit): ToolDefinition {
  return {
    name: "github_list_open_prs",
    description: "List open pull requests for a GitHub repository",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner (e.g. 'facebook')" },
        repo: { type: "string", description: "Repository name (e.g. 'react')" },
      },
      required: ["owner", "repo"],
    },
    async execute(args, _context): Promise<ToolResult> {
      const owner = args.owner as string;
      const repo = args.repo as string;
      try {
        const { data } = await octokit.pulls.list({
          owner,
          repo,
          state: "open",
          per_page: 10,
          sort: "created",
          direction: "desc",
        });
        const total = data.length;
        const prs = data.map((pr) => ({
          number: pr.number,
          title: pr.title,
          author: pr.user?.login ?? "unknown",
          created: pr.created_at,
        }));
        return {
          output: JSON.stringify({ total_shown: total, open_prs: prs }),
          evidence: makeEvidence(owner, repo),
        };
      } catch (err) {
        return handleOctokitError(err);
      }
    },
  };
}

function createGetPrDetails(octokit: Octokit): ToolDefinition {
  return {
    name: "github_get_pr_details",
    description: "Get details for a specific pull request",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        pr_number: { type: "number", description: "Pull request number" },
      },
      required: ["owner", "repo", "pr_number"],
    },
    async execute(args, _context): Promise<ToolResult> {
      const owner = args.owner as string;
      const repo = args.repo as string;
      const prNumber = args.pr_number as number;
      try {
        const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: prNumber });
        const { data: reviews } = await octokit.pulls.listReviews({
          owner,
          repo,
          pull_number: prNumber,
          per_page: 10,
        });
        const reviewStates = reviews.map((r) => r.state);
        return {
          output: JSON.stringify({
            number: pr.number,
            title: pr.title,
            body: pr.body ? pr.body.slice(0, 500) : null,
            author: pr.user?.login ?? "unknown",
            state: pr.state,
            merged: pr.merged,
            review_states: reviewStates,
            comments: pr.comments,
            review_comments: pr.review_comments,
            changed_files: pr.changed_files,
            additions: pr.additions,
            deletions: pr.deletions,
          }),
          evidence: makeEvidence(owner, repo),
        };
      } catch (err) {
        return handleOctokitError(err);
      }
    },
  };
}

function createListIssues(octokit: Octokit): ToolDefinition {
  return {
    name: "github_list_issues",
    description: "List open issues for a GitHub repository",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        labels: {
          type: "string",
          description: "Comma-separated label names to filter by (optional)",
        },
      },
      required: ["owner", "repo"],
    },
    async execute(args, _context): Promise<ToolResult> {
      const owner = args.owner as string;
      const repo = args.repo as string;
      const labels = args.labels as string | undefined;
      try {
        const { data } = await octokit.issues.listForRepo({
          owner,
          repo,
          state: "open",
          per_page: 10,
          sort: "created",
          direction: "desc",
          ...(labels ? { labels } : {}),
        });
        // Filter out pull requests (GitHub API returns PRs as issues)
        const issues = data
          .filter((item) => !item.pull_request)
          .map((issue) => ({
            number: issue.number,
            title: issue.title,
            labels: issue.labels.map((l) => (typeof l === "string" ? l : l.name)),
            assignee: issue.assignee?.login ?? null,
            created: issue.created_at,
          }));
        return {
          output: JSON.stringify({ total_shown: issues.length, issues }),
          evidence: makeEvidence(owner, repo),
        };
      } catch (err) {
        return handleOctokitError(err);
      }
    },
  };
}

function createGetIssueDetails(octokit: Octokit): ToolDefinition {
  return {
    name: "github_get_issue_details",
    description: "Get details for a specific issue",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        issue_number: { type: "number", description: "Issue number" },
      },
      required: ["owner", "repo", "issue_number"],
    },
    async execute(args, _context): Promise<ToolResult> {
      const owner = args.owner as string;
      const repo = args.repo as string;
      const issueNumber = args.issue_number as number;
      try {
        const { data: issue } = await octokit.issues.get({
          owner,
          repo,
          issue_number: issueNumber,
        });
        return {
          output: JSON.stringify({
            number: issue.number,
            title: issue.title,
            body: issue.body ? issue.body.slice(0, 500) : null,
            author: issue.user?.login ?? "unknown",
            state: issue.state,
            labels: issue.labels.map((l) => (typeof l === "string" ? l : l.name)),
            comments: issue.comments,
            created: issue.created_at,
            updated: issue.updated_at,
          }),
          evidence: makeEvidence(owner, repo),
        };
      } catch (err) {
        return handleOctokitError(err);
      }
    },
  };
}

function createGetRecentMerges(octokit: Octokit): ToolDefinition {
  return {
    name: "github_get_recent_merges",
    description: "Get recently merged pull requests for a GitHub repository",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        count: { type: "number", description: "Number of recent merges to return (default 10)" },
      },
      required: ["owner", "repo"],
    },
    async execute(args, _context): Promise<ToolResult> {
      const owner = args.owner as string;
      const repo = args.repo as string;
      const count = Math.min((args.count as number) ?? 10, 30);
      try {
        const { data } = await octokit.pulls.list({
          owner,
          repo,
          state: "closed",
          sort: "updated",
          direction: "desc",
          per_page: count,
        });
        const merged = data
          .filter((pr) => pr.merged_at !== null)
          .slice(0, count)
          .map((pr) => ({
            number: pr.number,
            title: pr.title,
            author: pr.user?.login ?? "unknown",
            merged_at: pr.merged_at,
          }));
        return {
          output: JSON.stringify({ total_shown: merged.length, merged_prs: merged }),
          evidence: makeEvidence(owner, repo),
        };
      } catch (err) {
        return handleOctokitError(err);
      }
    },
  };
}

export function registerGithubTools(registry: ToolRegistry, config: Config): void {
  const octokit = new Octokit({ auth: config.githubToken });
  registry.register(createListOpenPrs(octokit));
  registry.register(createGetPrDetails(octokit));
  registry.register(createListIssues(octokit));
  registry.register(createGetIssueDetails(octokit));
  registry.register(createGetRecentMerges(octokit));
}
