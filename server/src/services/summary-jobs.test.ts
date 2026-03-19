import { describe, expect, it } from "vitest";
import {
  getPendingSummaryJobCount,
  queueSummaryJob,
  waitForPendingSummaryJobs,
} from "./summary-jobs.js";

describe("summary-jobs", () => {
  it("waits for queued jobs to settle", async () => {
    let resolveJob: (() => void) | undefined;
    const job = new Promise<void>((resolve) => {
      resolveJob = resolve;
    });

    queueSummaryJob(job);
    expect(getPendingSummaryJobCount()).toBe(1);

    resolveJob?.();
    const result = await waitForPendingSummaryJobs(50);

    expect(result).toEqual({ pending: 1, timedOut: false });
    expect(getPendingSummaryJobCount()).toBe(0);
  });

  it("times out when jobs are still in flight", async () => {
    let resolveJob: (() => void) | undefined;
    const job = new Promise<void>((resolve) => {
      resolveJob = resolve;
    });

    queueSummaryJob(job);
    const result = await waitForPendingSummaryJobs(10);

    expect(result).toEqual({ pending: 1, timedOut: true });

    resolveJob?.();
    await waitForPendingSummaryJobs(50);
    expect(getPendingSummaryJobCount()).toBe(0);
  });
});
