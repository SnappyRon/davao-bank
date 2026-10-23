const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Monorepo root and workspace directories
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all monorepo files including packages/shared and repo root
config.watchFolders = [monorepoRoot, path.resolve(monorepoRoot, 'packages/shared')];

// 2. Resolve modules from both local and root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

module.exports = config;
