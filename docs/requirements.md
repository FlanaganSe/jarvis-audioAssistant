# Jarvis: Real-Time Voice Assistant

**Status:** Active
**Category:** AI Solution
**Role:** All Roles
**Languages:** Any (TypeScript, Python, Kotlin, Go, etc.)
**Email Thread:** [Gmail](https://mail.google.com/mail/u/2/#inbox/FMfcgzQfCDWVNDpDvjHNFqKmLsCDLpDt)
**Technical Contact:** wduffy@frontieraudio.com

---

## Problem Statement

Frontline workers require accurate, reliable, and instantaneous cross-team information. In their high-stakes environment, decisions are made in seconds, leaving zero tolerance for latency or data inaccuracies. We are building an unprecedented and intuitive software+hardware solution to solve this critical operational need.

---

## MVP Requirements

### 1. User Experience Focus

UI is secondary; UX is critical. Design it so you'd want to use it daily — a highly capable, low-latency, natural conversation experience.

### 2. Natural Conversation Cadence

Avoid long pauses and unnatural silence. Users should know if Jarvis is working — prefer notifying the user audibly if an action will take time.

### 3. Conversation Memory

Recall questions and answers from previous sessions (e.g., "Hey Jarvis, yesterday I asked about X — can you remind me what we were talking about?").

### 4. Interruptibility

Support interruptions (e.g., "Quiet, Jarvis").

### 5. Self-Awareness

Know its own limitations and communicate them clearly if asked (e.g., "What can you do, Jarvis?" → "I can pull data from an API, provide information about GitHub repos, etc.").

### 6. Zero Hallucinations

Completely accurate responses with no fabrications — say "I don't know" instead of making something up.

### 7. GitHub Integration

Ingest any public GitHub URL and answer questions about the repository: open PRs, issues, PR comments, last merges, and more.

### 8. API Data Handling

Answer questions based solely on data from a provided API (spec will be shared). Data refreshes every 3 minutes — responses must always use the latest data.

---

## Bonus Features

1. **Mobile Compatibility** — Build for mobile using Kotlin or Swift
2. **Passive Mode** — Run silently in the background, activating only when spoken to
3. **Scalability and Personalization** — Handle 10+ simultaneous users, support user sign-ins with data isolation, incorporate user preferences (e.g., "NEVER mention X; always flag Y")
4. **End-to-End Agent Capabilities** — Query open issues, analyze them, and automatically open PRs to fix them (e.g., "Perform analysis of XYZ issue and open a PR to fix it")