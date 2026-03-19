import { Octokit } from "@octokit/rest";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { Config } from "../config.js";
import { sessionSummaries, sessions } from "../db/schema.js";
import type { ToolRegistry } from "../services/tool-registry.js";
import type { ToolDefinition, ToolResult } from "./types.js";

function createRepoChanges(octokit: Octokit): ToolDefinition {
  return {
    name: "github_repo_changes",
    description:
      "Get what changed in a GitHub repository since the user last asked about it. Automatically determines the timeframe from session memory. Use when the user asks 'what changed', 'any updates', or 'what's new' about a repo.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
      },
      required: ["owner", "repo"],
    },
    async execute(args, context): Promise<ToolResult> {
      const owner = args.owner as string;
      const repo = args.repo as string;
      const repoRef = `${owner}/${repo}`;

      let since: Date;
      let sinceDescription: string;

      // Find when the user last discussed this repo
      if (context.userId) {
        try {
          const rows = await context.db
            .select({
              startedAt: sessions.startedAt,
            })
            .from(sessionSummaries)
            .innerJoin(sessions, eq(sessionSummaries.sessionId, sessions.id))
            .where(
              and(
                eq(sessions.userId, context.userId),
                isNotNull(sessions.endedAt),
                sql`${sessionSummaries.entities}::text ILIKE ${`%${repoRef}%`}`,
              ),
            )
            .orderBy(desc(sessions.startedAt))
            .limit(1);

          if (rows.length > 0 && rows[0]?.startedAt) {
            since = new Date(rows[0].startedAt);
            sinceDescription = `your last session on ${since.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`;
          } else {
            since = new Date(Date.now() - 24 * 60 * 60 * 1000);
            sinceDescription = "the last 24 hours (no prior conversation about this repo found)";
          }
        } catch {
          since = new Date(Date.now() - 24 * 60 * 60 * 1000);
          sinceDescription = "the last 24 hours (unable to check session history)";
        }
      } else {
        since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        sinceDescription = "the last 24 hours (no user identity)";
      }

      const sinceISO = since.toISOString();

      try {
        const [closedPrs, allIssues] = await Promise.all([
          octokit.pulls
            .list({
              owner,
              repo,
              state: "closed",
              sort: "updated",
              direction: "desc",
              per_page: 20,
            })
            .catch(() => ({ data: [] })),
          octokit.issues
            .listForRepo({
              owner,
              repo,
              state: "all",
              since: sinceISO,
              sort: "created",
              per_page: 20,
            })
            .catch(() => ({ data: [] })),
        ]);

        const prsMerged = closedPrs.data
          .filter((pr) => pr.merged_at && new Date(pr.merged_at) >= since)
          .slice(0, 10)
          .map((pr) => ({
            number: pr.number,
            title: pr.title,
            author: pr.user?.login ?? "unknown",
            merged_at: pr.merged_at,
          }));

        const issuesOnly = allIssues.data.filter((item) => !item.pull_request);
        const issuesOpened = issuesOnly
          .filter((issue) => new Date(issue.created_at) >= since)
          .map((issue) => ({
            number: issue.number,
            title: issue.title,
            labels: issue.labels.map((l) => (typeof l === "string" ? l : l.name)),
          }));
        const issuesClosed = issuesOnly
          .filter(
            (issue) =>
              issue.state === "closed" && issue.closed_at && new Date(issue.closed_at) >= since,
          )
          .map((issue) => ({
            number: issue.number,
            title: issue.title,
            closed_at: issue.closed_at,
          }));

        const delta = {
          repo: repoRef,
          since: sinceISO,
          since_description: sinceDescription,
          prs_merged: prsMerged,
          issues_opened: issuesOpened,
          issues_closed: issuesClosed,
          summary: `${prsMerged.length} PRs merged, ${issuesOpened.length} new issues opened, ${issuesClosed.length} issues closed since ${sinceDescription}`,
        };

        return {
          output: JSON.stringify(delta),
          evidence: {
            source: "github+memory",
            entity: `repo:${repoRef}`,
            fetchedAt: new Date().toISOString(),
            freshnessSec: 0,
            citationRef: "GitHub API + Session history",
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown GitHub API error";
        return { output: JSON.stringify({ error: message }), evidence: null };
      }
    },
  };
}

export function registerChangesTools(registry: ToolRegistry, config: Config): void {
  const octokit = new Octokit({ auth: config.githubToken });
  registry.register(createRepoChanges(octokit));
}
