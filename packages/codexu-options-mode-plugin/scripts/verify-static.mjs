#!/usr/bin/env node
/**
 * Static manifest-shape verification for the codexu-options-mode-plugin.
 * Validates that .codex-plugin/plugin.json, .agents/plugins/marketplace.json,
 * and skills/options-mode/SKILL.md have the required fields so manifest-shape
 * drift is caught without requiring a live codex binary.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJson(rel) {
  const full = path.join(pluginRoot, rel);
  try {
    return JSON.parse(readFileSync(full, 'utf8'));
  } catch (e) {
    throw new Error(`Failed to parse ${rel}: ${e.message}`);
  }
}

function readText(rel) {
  const full = path.join(pluginRoot, rel);
  try {
    return readFileSync(full, 'utf8');
  } catch (e) {
    throw new Error(`Failed to read ${rel}: ${e.message}`);
  }
}

// --- .codex-plugin/plugin.json ---
const plugin = readJson('.codex-plugin/plugin.json');
assert.ok(typeof plugin.name === 'string' && plugin.name.length > 0,
  'plugin.json: "name" must be a non-empty string');
assert.ok(typeof plugin.version === 'string' && /^\d+\.\d+\.\d+/.test(plugin.version),
  'plugin.json: "version" must be a semver string');
assert.ok(typeof plugin.hooks === 'string' && plugin.hooks.length > 0,
  'plugin.json: "hooks" must be a non-empty string path');
assert.ok(typeof plugin.skills === 'string' && plugin.skills.length > 0,
  'plugin.json: "skills" must be a non-empty string path');
assert.ok(plugin.interface && typeof plugin.interface.displayName === 'string',
  'plugin.json: "interface.displayName" must be a string');

// --- .agents/plugins/marketplace.json ---
const marketplace = readJson('.agents/plugins/marketplace.json');
assert.ok(typeof marketplace.name === 'string' && marketplace.name.length > 0,
  'marketplace.json: "name" must be a non-empty string');
assert.ok(Array.isArray(marketplace.plugins) && marketplace.plugins.length > 0,
  'marketplace.json: "plugins" must be a non-empty array');
const firstPlugin = marketplace.plugins[0];
assert.ok(typeof firstPlugin.name === 'string' && firstPlugin.name.length > 0,
  'marketplace.json: plugins[0].name must be a non-empty string');
assert.ok(firstPlugin.source && typeof firstPlugin.source.source === 'string',
  'marketplace.json: plugins[0].source.source must be a string');
assert.equal(firstPlugin.name, plugin.name,
  `marketplace.json plugins[0].name "${firstPlugin.name}" must match plugin.json name "${plugin.name}"`);

// --- skills/options-mode/SKILL.md ---
const skillMd = readText('skills/options-mode/SKILL.md');
assert.ok(skillMd.startsWith('---'),
  'SKILL.md must begin with a YAML front-matter block (---)',
);
const fmEnd = skillMd.indexOf('---', 3);
assert.ok(fmEnd > 3, 'SKILL.md front-matter must have a closing ---');
const frontMatter = skillMd.slice(3, fmEnd);
assert.ok(/^\s*name\s*:/m.test(frontMatter),
  'SKILL.md front-matter must contain a "name:" field');
assert.ok(/^\s*description\s*:/m.test(frontMatter),
  'SKILL.md front-matter must contain a "description:" field');
assert.ok(skillMd.includes('options-mode'),
  'SKILL.md body must reference "options-mode"');

console.log('verify-static passed: plugin.json, marketplace.json, and SKILL.md shapes are valid');
