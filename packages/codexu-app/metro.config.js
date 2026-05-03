const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname, {
  // Enable CSS support for web
  isCSSEnabled: true,
});

// Add support for .wasm files (required by Skia for all platforms)
// Source: https://shopify.github.io/react-native-skia/docs/getting-started/installation/
config.resolver.assetExts.push('wasm');

// Exclude Vitest test/spec files from the app bundle. Without this, Expo Router
// picks up any `.test.ts(x)` / `.spec.ts(x)` file under `sources/app/` as a
// route, Metro bundles it for Hermes, and the runtime dies on the top-level
// `await import(...)` pattern the tests use for module isolation. Vitest loads
// them through its own config — this only keeps them out of the Metro graph.
const testFilePatterns = [
  /.*\.test\.(ts|tsx|js|jsx)$/,
  /.*\.spec\.(ts|tsx|js|jsx)$/,
];
const existingBlockList = config.resolver.blockList;
config.resolver.blockList = Array.isArray(existingBlockList)
  ? [...existingBlockList, ...testFilePatterns]
  : existingBlockList
    ? [existingBlockList, ...testFilePatterns]
    : testFilePatterns;

// Enable inlineRequires for proper Skia and Reanimated loading
// Source: https://shopify.github.io/react-native-skia/docs/getting-started/web/
// Without this, Skia throws "react-native-reanimated is not installed" error
// This is cross-platform compatible (iOS, Android, web)
config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true, // Critical for @shopify/react-native-skia
  },
});

module.exports = config;