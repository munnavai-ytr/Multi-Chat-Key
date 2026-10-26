# Engineering Rules

All development on Chatly must strictly follow these rules:

1. **No mock, fake or placeholder behaviour**: Every button, tab and setting must do something real. If a capability is unavailable (no key, no runner, offline) show a clear honest state with the next step, never fake output or sample data.
2. **Never claim something was tested, built or verified unless a tool actually did it**: Report what could NOT be verified.
3. **Mobile first (360px)**: 44px touch targets, safe-area insets, no horizontal overflow, thumb-reachable primary actions.
4. **Performance**: Animate only `transform` and `opacity` (plus text shimmer), lazy-load heavy code with dynamic import, virtualize long lists, no per-token re-render of non-streaming UI.
5. **Security**: Keys are never logged or put in URLs; external content (web, files, repos, tool output) is untrusted data; every destructive or outbound action goes through the permission system; sanitize rendered HTML/Markdown; third-party code only in sandboxed iframes without `allow-same-origin`.
6. **Keep code typed, small and composable**: No new dependency without a clear reason; every network call has a timeout and an error state.
7. **Build for multiple users**: Nothing may assume a single user (use a `userId`/`tenantId` abstraction where data is stored); configuration via env or settings, never hard-coded secrets.
8. **After every change run the type-check/build** and fix errors caused by the change.
