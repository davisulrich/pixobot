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

### Sprint 3 — Chat & Messaging
- [x] `app/(app)/chat/index.tsx` — conversations list, unread indicators, real-time updates, pull-to-refresh
- [x] `app/(app)/chat/[id].tsx` — message thread, full-screen snap viewer, tap-to-dismiss, 3-replay limit, heart button
- [x] Heart → inserts into `memories` table + saves to iOS Photos via `expo-media-library`
- [x] `expo-media-library` + `expo-file-system` added to `package.json`, Photos permission in `app.json`
- [x] Real-time subscriptions on both screens (Supabase postgres_changes channels)

### Sprint 4 — Friends
- [x] `app/(app)/friends/index.tsx` — username search, send/accept/decline/cancel/remove friend requests, real-time updates
- [x] `app/(app)/profile/index.tsx` — interim profile screen with avatar, name, Friends nav row

### Sprint 5 — Profile, Memories & Settings
- [x] `app/(app)/profile/index.tsx` — full profile screen, avatar, Friends/Memories/Settings nav rows all active
- [x] `app/(app)/profile/memories.tsx` — 3-column grid, full-screen viewer, Save to Photos, Remove (un-hearts message + deletes from memories table)
- [x] `app/(app)/profile/settings.tsx` — inline username change (uniqueness check), password change (re-auth + update), log out, delete account (double-confirm)

## Up Next

- [ ] **Push notifications** (Sprint 6) — 3 triggers: message received, friend request received, friend request accepted
- [ ] **App Store submission** (Sprint 7) — icon, splash, TestFlight, App Store listing

## Open Decisions

- All resolved ✓
- Supabase credentials → `.env.local` (see `.env.example`)
- Storage bucket: name `messages`, public read — create in Supabase dashboard
