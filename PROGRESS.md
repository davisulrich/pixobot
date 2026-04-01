# Pixobot — Progress

## Done

### Foundation
- [x] Folder structure established (`app/(auth)`, `app/(app)`, `lib/`, `components/`)
- [x] Dependencies installed: `@supabase/supabase-js`, `@react-native-async-storage/async-storage`, `expo-secure-store`, `zustand`, `nativewind`, `tailwindcss`, `react-native-svg`, `expo-camera`
- [x] NativeWind v4 configured (`babel.config.js`, `metro.config.js`, `tailwind.config.js`, `global.css`)
- [x] `tokens.ts` — full design system (colors, typography, spacing, radius, shadow)
- [x] `lib/supabase.ts` — Supabase client with AsyncStorage session persistence
- [x] `lib/store/auth.ts` — Zustand auth store with session bootstrap + listener
- [x] `app/_layout.tsx` — root layout with auth gate + `/edit` screen in root Stack
- [x] `app/(auth)/login.tsx` — login screen (username + password)
- [x] `app/(auth)/signup.tsx` — signup screen with username validation
- [x] `app/(app)/_layout.tsx` — floating pill tab bar (Chat, Camera, Profile), hidden on camera tab
- [x] Placeholder screens for all routes: chat, chat/[id], friends, profile, memories, settings

### Camera Screen
- [x] `expo-camera` installed + `app.json` plugin configured (camera + microphone permissions)
- [x] `lib/store/media.ts` — Zustand store for pending captured media (URI + type)
- [x] `app/(app)/camera/index.tsx` — full implementation:
  - Full-bleed `CameraView`, edge-to-edge
  - Camera + microphone permissions gate with friendly request UI
  - Flash toggle (off → on → auto) — top-left, 40px semi-transparent circle
  - Camera flip (front ↔ back) — top-right, 40px semi-transparent circle
  - Shutter button — 72px yellow, SVG smiley face icon, centered at bottom 48px
  - Tap = photo (`takePictureAsync`), hold 250ms = video (`recordAsync` + `stopRecording`)
  - Scale pulse on capture (0.92 → 1.0, 120ms via Reanimated)
  - Red border + dot indicator while recording
  - After capture: stores URI in media store, pushes `/edit`
- [x] `app/edit.tsx` — placeholder (dismiss → back to camera, per confirmed UX)

## Up Next

- [ ] **Edit + Send screen** — full-bleed preview, drawing tool, text overlay, send button, friend selector
- [ ] **Conversations list** — unread indicators, conversation rows
- [ ] **Friends screen** — username search, invite link, friend requests
- [ ] **Profile screen** — display name, settings rows, memories link
- [ ] **Memories Album** — grid of hearted messages
- [ ] **Settings** — username change, password change, log out, delete account
- [ ] **Push notifications** — 3 triggers
- [ ] App Store submission

## Open Decisions

- Resolved: dismiss from Edit → back to camera ✓
- Supabase project credentials → add to `.env.local` (see `.env.example`)
