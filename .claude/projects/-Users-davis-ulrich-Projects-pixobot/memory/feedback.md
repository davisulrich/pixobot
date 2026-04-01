---
name: Feedback and confirmed decisions
description: Confirmed UX decisions and behavioral preferences from Davis
type: feedback
---

Dismiss from Edit screen → back to camera (not conversations list)
**Why:** User confirmed explicitly when asked before building edit screen.
**How to apply:** `router.back()` + `clearPending()` from edit.tsx returns to camera tab.

After sending a message → land on Conversations list
**Why:** User confirmed explicitly when asked before Sprint 2.
**How to apply:** `router.replace('/(app)/chat')` after successful send in send-to.tsx.

Work directly in project root (not worktrees) unless user asks
**Why:** User asked to merge worktree and work from main branch going forward after Sprint 1.
**How to apply:** Default to /Users/davis.ulrich/Projects/pixobot on main; only use EnterWorktree if explicitly requested.

Stop and ask about UX/product decisions before building
**Why:** PRD §3 and user's working style — they ask good clarifying questions.
**How to apply:** Any time a screen flow, layout choice, or copy decision is ambiguous, ask first.
