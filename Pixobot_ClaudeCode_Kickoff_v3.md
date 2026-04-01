# Claude Code — Pixobot Kickoff Prompt v3

> Paste everything below this line into Claude Code to start your session.

---

You are helping me build **Pixobot**, an iOS app built with React Native + Expo. I have already run `npx create-expo-app pixobot` and the project is in its default boilerplate state. We are building on top of that.

## Your role

You are my full-stack mobile developer. You will scaffold, write, and iterate on the entire codebase. Work feature by feature, install packages as needed, and keep me informed of what you're doing and why. Do not generate large amounts of code all at once — build one feature at a time, confirm it works, then move to the next.

## Ambiguity rules

- **UX / product decisions** (flows, layouts, copy, user experience) → **stop and ask me** before proceeding
- **Technical decisions** (implementation approach, library choice, query structure, state shape) → **mimic how Snapchat solves it**, then leave a `// Note:` comment explaining what you decided and why

---

# Pixobot — Product Requirements Document

**Version:** 3.0
**Platform:** iOS (React Native + Expo)
**Backend:** Supabase
**Status:** Pre-development

---

## 1. Overview

Pixobot is a photo and video messaging app for close friends and family. It is inspired by Snapchat but strips out all addictive, attention-driven features — no Discover page, no algorithmic content, no unsolicited messages from the platform. The experience is intentionally minimal, warm, and private.

---

## 2. Goals

- Provide a clean, distraction-free way to share ephemeral photos and videos with people you actually know
- Remove all engagement-bait patterns (no Discover, no streak pressure, no re-engagement nudges)
- Keep the experience simple enough that a grandma can use it intuitively
- Ship a working v1 to the Apple App Store

---

## 3. Ambiguity Handling

- **UX / product decisions** → Ask the developer before proceeding
- **Technical decisions** → Mimic how Snapchat solves it as a best guess, leave a `// Note:` comment

---

## 4. Non-Goals (Explicitly Out of Scope for v1)

- Android support
- Discover / public content feed
- Ads or monetization
- Stories
- Filters or lenses
- Text messaging / DMs
- Group chats
- Voice or video calling
- Streaks
- Custom avatar upload

---

## 5. Target Audience

- Close friend circles
- Family groups
- People who want a simpler, less noisy alternative to Snapchat

---

## 6. Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native + Expo |
| Navigation | Expo Router |
| Backend / Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email/username + password) |
| File Storage | Supabase Storage (photos, videos) |
| State Management | Zustand |
| Styling | NativeWind (Tailwind for RN) |
| Push Notifications | Expo Notifications |

---

## 7. Authentication

- **Username + password only** — no phone number, no SMS OTP, no email required
- On first login, users choose a username before entering the app
- Usernames must be unique across the platform

---

## 8. User Profile

- **Username** — unique, required, chosen at signup
- No avatar, no bio, no status, no follower count displayed in v1

---

## 9. Core Features

### 9.1 Adding Friends

- **Username search** — search for a user by exact username
- **Invite link** — generate a personal invite link to share via iMessage, AirDrop, etc.
- Friend requests must be accepted by the recipient
- No cap on number of friends

---

### 9.2 Camera & Media Capture

The camera screen is the home screen of the app.

- **Photo:** Tap shutter button
- **Video:** Hold shutter button, releases on lift

**Drawing tools (post-capture):**
- Brush tool with 2 colors: black and white

**Text overlay (post-capture):**
- Add multiple text boxes
- System font only
- Drag to reposition, pinch to resize
- Emoji support

---

### 9.3 Sending a Message

Each sent photo/video is called a **Message**.

**Disappear mode:**
- **Tap to dismiss:** Message stays on screen until recipient taps — then it's gone permanently

**Replay:**
- Replay button appears after first view
- Max 3 replays per Message
- Button disappears after 3rd replay

**Saving:**
- Recipient can heart ❤️ a Message to save it
- Hearting saves the media to the device's iOS Photos app
- Hearted Messages also appear in the **Memories Album** inside the app

**Screenshots:**
- No restrictions, sender not notified

---

## 10. Notifications

Only send push notifications for:

| Trigger | Notification Text |
|---|---|
| Message received | "[Username] sent you a Message" |
| Friend request received | "[Username] wants to be friends" |
| Friend request accepted | "[Username] accepted your friend request" |

Never send: re-engagement nudges or any platform-initiated prompts.

---

## 11. Visual Design

> **This section is the source of truth for all design decisions. When in doubt, refer back here.**

### 11.1 Design Philosophy

The design is **modern minimalism with a friendly touch**. Clean white space, confident typography, soft rounded shapes, and just enough warmth that it doesn't feel cold or corporate.

The goal is an app that feels premium and calm, but approachable. Not clinical. Not trendy. Timeless.

---

### 11.2 Color Palette

| Token | Value | Usage |
|---|---|---|
| `--color-bg` | `#F8F7F5` | App background (warm off-white, never pure white) |
| `--color-surface` | `#FFFFFF` | Cards, sheets, modals |
| `--color-surface-muted` | `#F0EEE9` | Secondary surfaces, input backgrounds |
| `--color-border` | `#E5E2DB` | Dividers, card borders |
| `--color-text-primary` | `#1A1815` | Headings, body text |
| `--color-text-secondary` | `#8A8580` | Subtext, labels, timestamps |
| `--color-text-tertiary` | `#B8B4AE` | Placeholder text, disabled states |
| `--color-accent` | `#F5C842` | Primary accent — warm yellow (CTAs, active states, unread indicators) |
| `--color-accent-dark` | `#1A1815` | Text color used on top of yellow backgrounds |
| `--color-destructive` | `#D94F4F` | Destructive actions only (log out, delete account) |

**Rules:**
- The accent yellow (`#F5C842`) is used sparingly — primary CTAs, unread indicators, active nav item. It should always feel like a highlight, never a wallpaper.
- Backgrounds stay warm and off-white. Never use `#FFFFFF` for the app background.
- No gradients anywhere in UI chrome. The camera viewfinder is the only full-bleed surface.

---

### 11.3 Typography

**Font:** System font stack (SF Pro on iOS). No custom fonts — keep it native and fast.

| Style | Size | Weight | Usage |
|---|---|---|---|
| Display | 32px | 700 Bold | Profile name, large screen titles |
| Title | 20px | 600 Semibold | Screen headers (e.g. "Chat", "Profile") |
| Headline | 17px | 500 Medium | Conversation names, list items |
| Body | 15px | 400 Regular | Descriptions, general content |
| Caption | 13px | 400 Regular | Timestamps, secondary labels |
| Label | 11px | 500 Medium | Nav labels, tags, version string |

**Rules:**
- Letter spacing on uppercase labels: `0.08em`
- Line height: `1.5` for body, `1.2` for display/title
- No all-caps except nav labels and metadata tags

---

### 11.4 Shape & Spacing

**Border radius:**
- Large cards / sheets: `20px`
- Buttons (primary pill): `50px` (fully rounded)
- Small buttons / chips: `12px`
- Avatar circles: `50%`
- Input fields: `14px`
- Bottom navigation pill: `32px`

**Spacing scale (8px base):**
- `4px` — tight internal gaps (icon padding)
- `8px` — small gaps
- `16px` — standard component padding
- `20px` — card padding
- `24px` — section spacing
- `32px` — large section breaks
- `48px` — screen-level top padding

**Rules:**
- Generous whitespace throughout. When unsure, add more space.
- Content should never feel cramped or dense.

---

### 11.5 Screen-by-Screen Design Notes

#### Camera (Home Screen)
- Camera viewfinder fills the entire screen edge-to-edge
- Flash toggle (top-left) and camera flip (top-right): `40px` diameter, semi-transparent dark background (`rgba(0,0,0,0.45)`), white icons
- Shutter button: centered at bottom, `72px` diameter, warm yellow (`#F5C842`) with a simple friendly smiley face icon
- No bottom nav bar on the camera screen

#### Edit / Send Screen (Post-Capture)
- Full-bleed photo/video background
- Top-left: `×` dismiss button (dark semi-transparent pill)
- Top-right: vertical toolbar in a single dark rounded pill — Text (Tt), Draw (pen icon), Emoji stacked vertically
- Color selector (draw mode only): two stacked circles — black on top, white below — to the right of the toolbar pill. Tapping cycles between the two colors.
- Bottom-right: **Send button** — large yellow circle (`64px`), dark arrow icon
- Bottom-left: Disappear mode indicator — small dark pill showing tap-to-dismiss icon (this is the only mode; the pill is informational, not interactive)

#### Conversations List
- Background: `#F8F7F5`
- Top-left: username initial or placeholder — tapping opens Profile
- Title: "Chat" in Title weight
- Top-right: search icon
- Each conversation row:
  - Left: yellow square (`28px`, `6px` radius) if unread — empty square outline if read
  - Name in Headline weight
  - No timestamp, no preview text (keeps it clean)
- Bottom navigation: floating pill (see Navigation section below)

#### Send To Screen
- Back arrow + "Send To" title
- Top-right: add friend icon
- Search bar: full-width, `#F0EEE9` background, no border, search icon inside, `14px` radius
- **Recents section:** horizontal scroll row of initials circles with name below — selected state has yellow ring (`#F5C842`, `2px`)
- **Friends section:** vertical list with initials circle left, name + username stacked, radio circle right
  - Selected row: subtle yellow tint background (`#F5C842` at 10% opacity), radio becomes filled yellow checkmark
- **Sticky send button:** floating at bottom — dark count bubble showing number selected + "Send →" yellow pill button, fully rounded, dark text

#### Profile Screen
- Background: `#F8F7F5`
- Title: "Profile"
- Display name in Display weight (32px bold), left-aligned
- Username in secondary text below
- Settings group card: white surface, `20px` radius
  - Rows: Account, Privacy, Memories (heart icon), Log Out (destructive red)
  - Each row: label left, chevron or icon right, `0.5px` border-bottom separator between rows (not on last row)
- Version string at bottom: Label style, tertiary text color, all-caps

#### Memories Album Screen
- Grid of saved media (photos/videos the user hearted)
- Each cell: square thumbnail, `4px` gap between cells, 3 columns
- Tapping a cell opens the media full-screen
- Full-screen view: full-bleed media, bottom overlay with two dark rounded pill buttons side by side — "Save to Photos" (download icon) and "Remove" (trash icon, destructive)
- Buttons: `#2A2218` at ~85% opacity, white text + icon, `50px` height, `16px` radius

#### Navigation (Bottom Tab Bar)
- Floating pill — centered, does not span full width, `32px` border-radius, white background, subtle shadow (`y: 4px, blur: 12px, opacity: 0.08`)
- Three tabs: Chat (speech bubble), Camera (camera), Profile (person)
- Active tab: icon filled yellow (`#F5C842`)
- No labels — icons only

---

### 11.6 Iconography

- Line icons at `22px`, `1.5px` stroke weight — clean, not heavy
- No pixel art in v1 (avatars removed from scope)
- The shutter smiley face is the app's one signature illustration element — keep it warm and simple

---

### 11.7 Motion & Micro-interactions

- Screen transitions: native iOS slide (Expo Router default)
- Shutter capture: brief scale pulse (`0.92` → `1.0`, 120ms)
- Send button: scale down on press (`0.95`), snaps back on release
- No other animations — static is cleaner

---

### 11.8 What to Avoid

- No gradients anywhere in UI chrome
- No shadows except the floating nav pill
- No bright color backgrounds behind content
- No bold color blocks in headers or navigation
- No dense layouts — if a screen feels crowded, remove something
- No all-caps except nav labels and metadata tags
- No timestamps or preview text in the conversations list

---

## 12. Screen Map

| Screen | Description |
|---|---|
| Onboarding | Username + password signup / login |
| Camera (Home) | Default screen — camera viewfinder, capture |
| Edit / Send | Post-capture editing + friend selector |
| Conversations List | All message threads |
| Conversation Thread | Opens received Message for viewing |
| Friends | Friend list, pending requests, search, invite link |
| Profile | Username, Memories Album link, settings |
| Memories Album | Grid of hearted/saved Messages |
| Settings | Change username, change password, log out, delete account |

---

## 13. Data Model

| Table | Key Fields |
|---|---|
| `users` | id, username, password_hash, created_at |
| `friendships` | id, user_id_1, user_id_2, status (pending/accepted), created_at |
| `conversations` | id, participant_ids[], last_activity_at |
| `messages` | id, conversation_id, sender_id, media_url, replay_count, hearted, created_at, opened_at |
| `memories` | id, user_id, message_id, saved_at |

---

## 14. MVP Checklist

- [ ] Username + password auth (signup and login)
- [ ] Camera with photo + video capture
- [ ] Drawing tool (black and white brush)
- [ ] Text overlay (multi-box, drag + resize, emoji support)
- [ ] Friend requests (username search + invite link)
- [ ] Send Message to one or more friends
- [ ] Tap-to-dismiss disappear mode
- [ ] 3-replay limit
- [ ] Heart to save → Memories Album + iOS Photos
- [ ] Push notifications (3 triggers only)
- [ ] Memories Album screen
- [ ] Profile screen
- [ ] Settings screen (username, password, log out, delete account)
- [ ] App Store assets + submission

---

## 15. How to Proceed

1. **Audit the boilerplate** — examine the file structure from `npx create-expo-app` and report what you see
2. **Propose a folder structure** before writing any code — confirm with me before proceeding
3. **Set up the foundation:** install dependencies, configure Supabase, set up Expo Router, configure NativeWind, create a `tokens.ts` file with all design constants from Section 11
4. **Build feature by feature in this order:**
   - Design tokens (`tokens.ts` — colors, typography, spacing, radius)
   - Auth (username + password, signup + login screens)
   - Navigation shell (tab structure, screen placeholders)
   - Camera screen
   - Edit + send flow
   - Conversations list + message thread viewer
   - Friends screen
   - Profile + Memories Album
   - Settings
   - Push notifications
5. After each feature, pause and ask if I want to review before continuing
6. Keep a `PROGRESS.md` file in the root updated with what's done, what's next, and any open decisions
