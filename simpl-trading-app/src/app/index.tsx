import { Redirect } from "expo-router";

// The app always opens on the Watchlists tab (see CLAUDE.md §5/§6).
// This gets replaced by the real router state machine (CLAUDE.md §4 — not
// logged in -> welcome, no account -> onboarding, etc.) at the Phase 2 auth
// milestone; for now there's no auth state to route on yet.
export default function Index() {
  return <Redirect href="/watchlists" />;
}
