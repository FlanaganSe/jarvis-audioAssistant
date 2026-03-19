import { Octokit } from "@octokit/rest";
import OpenAI from "openai";
import type { Config } from "../config.js";
import type { ToolRegistry } from "../services/tool-registry.js";
import type { ToolDefinition, ToolResult } from "./types.js";

const PROMPTS: Record<string, string> = {
  fix_plan: `Analyze this GitHub issue and propose a fix plan.

Return JSON with:
- analysis: 2-3 sentence summary of the problem
- approach: proposed fix approach (1-2 paragraphs)
- files_likely_involved: list of file paths or areas that would need changes
- estimated_complexity: "small" | "medium" | "large"
- risks: potential risks or side effects of the fix

Only return valid JSON.`,

  pr_outline: `Draft a PR outline to address this issue.

Return JSON with:
- title: PR title
- description: PR body (markdown, 3-5 paragraphs)
- branch_name: suggested branch name
- key_changes: list of key changes to make

Only return valid JSON.`,

  comment_draft: `Draft a helpful comment for this issue.

Return JSON with:
- comment: the comment text (markdown)
- tone: "technical" | "supportive" | "questioning"

Only return valid JSON.`,
};

export interface ProposalToolResult extends ToolResult {
  proposalData?: {
    type: string;
    title: string;
    issueRef: string;
    data: Record<string, unknown>;
  };
}

function createProposeAction(octokit: Octokit, openaiClient: OpenAI): ToolDefinition {
  return {
    name: "github_propose_action",
    description:
      "Analyze a GitHub issue and propose an action plan. Returns a structured proposal that requires user approval. Use when the user asks to fix an issue, propose a solution, draft a PR, or draft a comment.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        issue_number: { type: "number", description: "Issue number" },
        action_type: {
          type: "string",
          enum: ["fix_plan", "pr_outline", "comment_draft"],
          description: "Type of proposal to generate",
        },
      },
      required: ["owner", "repo", "issue_number", "action_type"],
    },
    async execute(args, _context): Promise<ProposalToolResult> {
      const owner = args.owner as string;
      const repo = args.repo as string;
      const issueNumber = args.issue_number as number;
      const actionType = args.action_type as string;

      const prompt = PROMPTS[actionType];
      if (!prompt) {
        return {
          output: JSON.stringify({ error: `Unknown action type: ${actionType}` }),
          evidence: null,
        };
      }

      try {
        // Fetch issue details
        const { data: issue } = await octokit.issues.get({
          owner,
          repo,
          issue_number: issueNumber,
        });

        // Fetch first 10 comments
        let commentsText = "";
        try {
          const { data: comments } = await octokit.issues.listComments({
            owner,
            repo,
            issue_number: issueNumber,
            per_page: 10,
          });
          commentsText = comments
            .map((c) => `@${c.user?.login ?? "unknown"}: ${(c.body ?? "").slice(0, 500)}`)
            .join("\n\n");
          if (comments.length < (issue.comments ?? 0)) {
            commentsText += `\n\n(showing first 10 of ${issue.comments} comments)`;
          }
        } catch {
          commentsText = "(unable to fetch comments)";
        }

        const labels = issue.labels.map((l) => (typeof l === "string" ? l : l.name)).join(", ");

        const issueContext = `Issue #${issueNumber}: ${issue.title}
Body: ${(issue.body ?? "").slice(0, 2000)}
Labels: ${labels || "none"}
Recent comments:
${commentsText}`;

        // Call GPT-4o-mini for analysis
        const completion = await openaiClient.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: prompt },
            { role: "user", content: issueContext },
          ],
          response_format: { type: "json_object" },
        });

        const raw = completion.choices[0]?.message?.content;
        if (!raw) {
          return {
            output: JSON.stringify({ error: "Empty response from analysis" }),
            evidence: null,
          };
        }

        let proposalData: Record<string, unknown>;
        try {
          proposalData = JSON.parse(raw);
        } catch {
          proposalData = { raw_analysis: raw };
        }

        const issueRef = `${owner}/${repo}#${issueNumber}`;
        const title = `${issue.title} (#${issueNumber})`;

        const result: ProposalToolResult = {
          output: JSON.stringify({
            proposal_type: actionType,
            issue_ref: issueRef,
            issue_title: issue.title,
            ...proposalData,
          }),
          evidence: {
            source: "github+analysis",
            entity: `issue:${issueRef}`,
            fetchedAt: new Date().toISOString(),
            freshnessSec: 0,
            citationRef: "Issue analysis via GPT-4o-mini",
          },
          proposalData: {
            type: actionType,
            title,
            issueRef,
            data: proposalData,
          },
        };

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return { output: JSON.stringify({ error: message }), evidence: null };
      }
    },
  };
}

export function registerProposalTools(registry: ToolRegistry, config: Config): void {
  const octokit = new Octokit({ auth: config.githubToken });
  const openaiClient = new OpenAI({ apiKey: config.openaiApiKey });
  registry.register(createProposeAction(octokit, openaiClient));
}
