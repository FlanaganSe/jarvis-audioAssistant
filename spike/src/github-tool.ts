import { Octokit } from "@octokit/rest";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

export const GITHUB_TOOL_DEF = {
  type: "function" as const,
  name: "github_list_open_prs",
  description:
    "List open pull requests for a public GitHub repository. Returns PR number, title, author, and created date for the most recent open PRs.",
  parameters: {
    type: "object",
    properties: {
      owner: { type: "string", description: "Repository owner (e.g., 'facebook')" },
      repo: { type: "string", description: "Repository name (e.g., 'react')" },
    },
    required: ["owner", "repo"],
  },
};

export const SYSTEM_INSTRUCTIONS = `You are Jarvis, a concise voice assistant for frontline workers. Keep spoken answers to 1-3 sentences unless asked for more detail.

Rules:
- For questions about GitHub repositories, you MUST use the github_list_open_prs tool. Never make up PR numbers, titles, or authors.
- If you don't have a tool to answer a question, say "I don't have that information right now."
- When reporting tool results, cite the exact numbers from the tool response.`;

export const OPENAI_MODEL = "gpt-realtime-mini";

export async function executeGitHubTool(
  args: { owner: string; repo: string },
): Promise<string> {
  const { data } = await octokit.pulls.list({
    owner: args.owner,
    repo: args.repo,
    state: "open",
    per_page: 5,
    sort: "created",
    direction: "desc",
  });

  const prs = data.map((pr) => ({
    number: pr.number,
    title: pr.title,
    author: pr.user?.login ?? "unknown",
    created_at: pr.created_at,
  }));

  return JSON.stringify({ total_open: prs.length, prs });
}
