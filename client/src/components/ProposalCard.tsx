import { useState } from "react";
import { colors, fontSizes, radii, spacing } from "../styles.js";
import type { ProposalInfo } from "../types.js";

interface ProposalCardProps {
  proposal: ProposalInfo;
}

const PROPOSAL_LABELS: Record<string, string> = {
  fix_plan: "Fix Plan",
  pr_outline: "PR Outline",
  comment_draft: "Comment Draft",
};

const COMPLEXITY_COLORS: Record<string, string> = {
  small: colors.success,
  medium: colors.warning,
  large: colors.error,
};

export function ProposalCard({ proposal }: ProposalCardProps): React.JSX.Element | null {
  const [dismissed, setDismissed] = useState(false);
  const [approveMsg, setApproveMsg] = useState(false);

  if (dismissed) return null;

  const { type, title, issueRef, data } = proposal;
  const label = PROPOSAL_LABELS[type] ?? type;

  return (
    <div
      style={{
        marginTop: spacing.sm,
        border: `1px solid ${colors.accent}`,
        borderLeft: `3px solid ${colors.accent}`,
        borderRadius: radii.md,
        background: colors.surface,
        padding: spacing.md,
        maxWidth: "100%",
      }}
    >
      {/* Header */}
      <div
        style={{
          fontSize: fontSizes.xs,
          color: colors.accent,
          fontWeight: 600,
          marginBottom: spacing.xs,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        Draft Proposal: {label}
      </div>
      <div
        style={{
          fontSize: fontSizes.md,
          color: colors.textPrimary,
          fontWeight: 600,
          marginBottom: spacing.sm,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: fontSizes.xs, color: colors.textMuted, marginBottom: spacing.md }}>
        {issueRef}
      </div>

      {/* Content based on type */}
      {type === "fix_plan" && <FixPlanContent data={data} />}
      {type === "pr_outline" && <PrOutlineContent data={data} />}
      {type === "comment_draft" && <CommentDraftContent data={data} />}

      {/* Footer buttons */}
      <div
        style={{
          display: "flex",
          gap: spacing.sm,
          marginTop: spacing.md,
          borderTop: `1px solid ${colors.border}`,
          paddingTop: spacing.sm,
        }}
      >
        <button
          type="button"
          onClick={() => setApproveMsg(true)}
          style={{
            padding: `${spacing.xs}px ${spacing.md}px`,
            borderRadius: radii.sm,
            border: "none",
            background: approveMsg ? colors.surface : colors.success,
            color: approveMsg ? colors.textMuted : "#fff",
            fontSize: fontSizes.sm,
            fontWeight: 600,
            cursor: approveMsg ? "default" : "pointer",
          }}
        >
          {approveMsg ? "Coming soon" : "Approve"}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          style={{
            padding: `${spacing.xs}px ${spacing.md}px`,
            borderRadius: radii.sm,
            border: `1px solid ${colors.border}`,
            background: "transparent",
            color: colors.textMuted,
            fontSize: fontSizes.sm,
            cursor: "pointer",
          }}
        >
          Dismiss
        </button>
      </div>
      {approveMsg && (
        <div
          style={{
            fontSize: fontSizes.xs,
            color: colors.textMuted,
            marginTop: spacing.xs,
            fontStyle: "italic",
          }}
        >
          Approval workflows are coming soon. In a future version, clicking Approve would execute
          this action with your permission.
        </div>
      )}
    </div>
  );
}

function Section({
  label,
  children,
}: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ marginBottom: spacing.sm }}>
      <div
        style={{
          fontSize: fontSizes.xs,
          color: colors.textSecondary,
          fontWeight: 600,
          marginBottom: 2,
          textTransform: "uppercase",
          letterSpacing: 0.3,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: fontSizes.sm, color: colors.textPrimary, lineHeight: 1.5 }}>
        {children}
      </div>
    </div>
  );
}

function FixPlanContent({ data }: { data: Record<string, unknown> }): React.JSX.Element {
  const complexity = data.estimated_complexity as string | undefined;
  const complexityColor = complexity ? (COMPLEXITY_COLORS[complexity] ?? colors.textMuted) : null;

  return (
    <>
      {data.analysis && <Section label="Analysis">{data.analysis as string}</Section>}
      {data.approach && <Section label="Approach">{data.approach as string}</Section>}
      {Array.isArray(data.files_likely_involved) && data.files_likely_involved.length > 0 && (
        <Section label="Files Involved">
          {(data.files_likely_involved as string[]).map((f) => (
            <div key={f} style={{ fontFamily: "monospace", fontSize: fontSizes.xs }}>
              {f}
            </div>
          ))}
        </Section>
      )}
      {complexity && (
        <Section label="Complexity">
          <span
            style={{
              display: "inline-block",
              padding: `1px ${spacing.sm}px`,
              borderRadius: radii.sm,
              background: `${complexityColor}22`,
              color: complexityColor ?? undefined,
              fontSize: fontSizes.xs,
              fontWeight: 600,
            }}
          >
            {complexity}
          </span>
        </Section>
      )}
      {data.risks && <Section label="Risks">{data.risks as string}</Section>}
    </>
  );
}

function PrOutlineContent({ data }: { data: Record<string, unknown> }): React.JSX.Element {
  return (
    <>
      {data.title && <Section label="PR Title">{data.title as string}</Section>}
      {data.description && <Section label="Description">{data.description as string}</Section>}
      {data.branch_name && (
        <Section label="Branch">
          <code style={{ fontFamily: "monospace", fontSize: fontSizes.xs }}>
            {data.branch_name as string}
          </code>
        </Section>
      )}
      {Array.isArray(data.key_changes) && data.key_changes.length > 0 && (
        <Section label="Key Changes">
          <ul style={{ margin: 0, paddingLeft: spacing.lg }}>
            {(data.key_changes as string[]).map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

function CommentDraftContent({ data }: { data: Record<string, unknown> }): React.JSX.Element {
  return (
    <>
      {data.comment && <Section label="Comment">{data.comment as string}</Section>}
      {data.tone && (
        <Section label="Tone">
          <span style={{ fontStyle: "italic" }}>{data.tone as string}</span>
        </Section>
      )}
    </>
  );
}
