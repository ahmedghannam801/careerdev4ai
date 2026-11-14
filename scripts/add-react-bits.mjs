#!/usr/bin/env node
/**
 * CareerPilot AI — React Bits installer
 * ---------------------------------------------------------------------------
 * React Bits (reactbits.dev) is not an npm package: every component is source
 * code you own. Its documentation ships a `shadcn` CLI shortcut, but that CLI
 * picks `bun` whenever a `bun.lock` sits in the repo, which fails on machines
 * (and CI) that only have npm.
 *
 * This script pulls the same registry JSON the CLI uses, writes the files into
 * `src/components/react-bits/<Component>/`, and installs the component's
 * dependencies with npm. It is dependency-free and works on Node 18+.
 *
 * Usage
 *   npm run ui:add -- SplitText
 *   npm run ui:add -- SplitText AnimatedContent GradientText
 *   npm run ui:add -- SplitText --variant JS-TW   (JS instead of TS)
 *   npm run ui:add -- SplitText --force           (overwrite local edits)
 *
 * Naming: a component's registry id is `<Name>-<TS|JS>-<TW|CSS>`. This script
 * defaults to `TS-TW`, which matches this project: TypeScript + Tailwind v4.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = 'https://reactbits.dev/r';
const TARGET_ROOT = join(ROOT, 'src', 'components', 'react-bits');

const args = process.argv.slice(2);
const force = args.includes('--force');
const variantFlag = args.findIndex((arg) => arg === '--variant');
const variant =
  variantFlag === -1 ? 'TS-TW' : (args[variantFlag + 1] || 'TS-TW').toUpperCase();

const names = args.filter(
  (arg, index) =>
    !arg.startsWith('--') && (variantFlag === -1 || index !== variantFlag + 1)
);

if (names.length === 0) {
  console.error(
    'Usage: npm run ui:add -- <Component> [<Component>...] [--variant TS-TW] [--force]'
  );
  process.exit(1);
}

const readInstalled = () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  return { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
};

const parseDependency = (spec) => {
  // "gsap@^3.13.0" / "@gsap/react@^2.1.2" / "three"
  const at = spec.lastIndexOf('@');
  if (at <= 0) return { name: spec, range: null };
  return { name: spec.slice(0, at), range: spec.slice(at + 1) };
};

const install = (specs) => {
  if (specs.length === 0) return;
  console.log(`\nInstalling dependencies: ${specs.join(' ')}`);
  const quote = (spec) => (/[\s"']/.test(spec) ? `"${spec.replace(/"/g, '\\"')}"` : spec);
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(
    `${npm} install ${specs.map(quote).join(' ')}`,
    {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true,
    }
  );
  if (result.status !== 0) {
    console.error('Dependency installation failed. Install them manually:');
    console.error(`  npm install ${specs.join(' ')}`);
    process.exitCode = 1;
  }
};

const addComponent = async (name) => {
  const id = `${name}-${variant}`;
  const url = `${REGISTRY}/${id}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Registry responded ${response.status} for ${url}`);
  }
  const item = await response.json();

  console.log(`\n${item.title || name} (${id})`);

  for (const file of item.files || []) {
    // Registry paths look like "SplitText/SplitText.tsx".
    const target = join(TARGET_ROOT, file.path);
    if (existsSync(target) && !force) {
      console.log(`  skipped (exists): ${relative(ROOT, target)}`);
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.content, 'utf8');
    console.log(`  wrote: ${relative(ROOT, target)}`);
  }

  if (item.registryDependencies?.length) {
    console.log(
      `  note: also needs registry items: ${item.registryDependencies.join(', ')}`
    );
  }

  const installed = readInstalled();
  const missing = (item.dependencies || []).filter((spec) => {
    const { name: dep } = parseDependency(spec);
    return !installed[dep];
  });

  install(missing.map((spec) => spec));
};

for (const name of names) {
  await addComponent(name);
}
