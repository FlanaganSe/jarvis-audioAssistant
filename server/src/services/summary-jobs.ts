const pendingSummaryJobs = new Set<Promise<void>>();

export function queueSummaryJob(job: Promise<void>): void {
  pendingSummaryJobs.add(job);

  void job.finally(() => {
    pendingSummaryJobs.delete(job);
  });
}

export function getPendingSummaryJobCount(): number {
  return pendingSummaryJobs.size;
}

export async function waitForPendingSummaryJobs(timeoutMs: number): Promise<{
  pending: number;
  timedOut: boolean;
}> {
  const jobs = [...pendingSummaryJobs];
  if (jobs.length === 0) {
    return { pending: 0, timedOut: false };
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timeoutHandle = setTimeout(() => resolve("timeout"), timeoutMs);
  });

  const settled = Promise.allSettled(jobs).then(() => "settled" as const);
  const result = await Promise.race([settled, timeout]);

  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
  }

  return { pending: jobs.length, timedOut: result === "timeout" };
}
