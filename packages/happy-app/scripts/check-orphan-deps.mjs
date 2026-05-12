#!/usr/bin/env node
// AC-D12 dep-audit script (STUB).
//
// US-D0 ships this as a stub; full implementation is deferred to US-D4 per
// plan.md §"Files to Create" — the audit greps `sources/**/*.{ts,tsx}` +
// `app.config.js` + `metro.config.js` + AndroidManifest.xml for each candidate
// dep and emits a per-dep report into `dep-audit.md`.
//
// The script is AUDIT-ONLY: it does NOT mutate package.json and does NOT
// remove deps. It always exits 0 unless the script itself errors.
//
// Candidate dep list (pre-seeded; US-D4 will broaden as deletions land):
//   tweetnacl, rn-encryption, @stablelib/hex, react-native-quick-base64,
//   @livekit/react-native, @livekit/react-native-webrtc, livekit-client,
//   react-native-webrtc, react-native-audio-api, expo-audio, expo-camera,
//   react-native-vision-camera, @elevenlabs/react, @elevenlabs/react-native.

console.log('[check-orphan-deps] STUB (US-D0). Full audit logic lands in US-D4.');
console.log('[check-orphan-deps] No deps audited; no dep-audit.md written.');
process.exit(0);
