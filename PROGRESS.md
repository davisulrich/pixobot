# Pixobot — Progress

## Done

### Sprint 1 — Foundation + Camera
- [x] Folder structure (`app/(auth)`, `app/(app)`, `lib/`, `components/`)
- [x] Dependencies: supabase, zustand, nativewind, tailwindcss, react-native-svg, expo-camera
- [x] NativeWind v4 configured (babel, metro, tailwind, global.css)
- [x] `tokens.ts` — full design system (colors, type scale, spacing, radius, shadow)
- [x] `lib/supabase.ts` — Supabase client with AsyncStorage session persistence
- [x] `lib/store/auth.ts` — Zustand auth store, bootstrapped at module load
- [x] `lib/store/media.ts` — Zustand store for pending captured media
- [x] `app/index.tsx` — loading state + auth-aware redirect
- [x] `app/_layout.tsx` — root Stack with auth gate
- [x] `app/(auth)/login.tsx` + `signup.tsx` — username+password auth
- [x] `app/(app)/_layout.tsx` — floating pill tab bar, hidden on camera
- [x] `app/(app)/camera.tsx` — full-bleed viewfinder, flash, flip, tap=photo/hold=video, smiley shutter, Reanimated pulse
- [x] Placeholder screens: chat, chat/[id], friends, profile, memories, settings

### Sprint 2 — Edit + Send Flow
- [x] `expo-video` installed for video preview
- [x] `app/edit.tsx` — full-bleed photo/video preview, SVG draw canvas (black/white brush), draggable + pinch-resizable text boxes, vertical toolbar pill, disappear indicator, send button (→ /send-to)
- [x] `app/send-to.tsx` — friend list from Supabase, recents horizontal row, multi-select (yellow ring/tint), search bar, upload to Storage, find/create conversation, insert message, land on chat
- [x] `supabase/schema.sql` — all 5 tables (users, friendships, conversations, messages, memories) with RLS policies + storage bucket instructions
- [x] `send-to` registered in root Stack (slide from bottom animation)

## Up Next

- [ ] **Supabase setup** — run `supabase/schema.sql` in your project's SQL editor; create `messages` storage bucket (public read)
- [ ] **Conversations list** (`app/(app)/chat/index.tsx`) — unread indicators, conversation rows, real-time updates
- [ ] **Message thread viewer** (`app/(app)/chat/[id].tsx`) — tap to dismiss, replay counter (max 3), heart to save → Memories + iOS Photos
- [ ] **Friends screen** — username search, send/accept friend requests, invite link
- [ ] **Profile screen** — display name, settings rows, memories link
- [ ] **Memories Album** — 3-column grid of hearted media, full-screen viewer
- [ ] **Settings** — username change, password change, log out, delete account
- [ ] **Push notifications** — 3 triggers (message received, friend request, accepted)
- [ ] App Store submission

## Open Decisions

- All resolved ✓
- Supabase credentials → `.env.local` (see `.env.example`)
- Storage bucket: name `messages`, public read — create in Supabase dashboard
