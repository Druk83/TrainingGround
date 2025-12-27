#!/usr/bin/env node
/**
 * Post-build script to add SRI integrity attributes to index.html
 * Run after Vite build completes
 */

import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { addSRIToHTML } from '../vite-plugin-sri.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const distDir = join(__dirname, '..', 'dist');
const htmlPath = join(distDir, 'index.html');
const sriManifestPath = join(distDir, 'sri-manifest.json');

if (!existsSync(htmlPath)) {
  console.error('❌ index.html not found in dist/');
  process.exit(1);
}

if (!existsSync(sriManifestPath)) {
  console.error('❌ sri-manifest.json not found in dist/');
  process.exit(1);
}

try {
  addSRIToHTML(htmlPath, sriManifestPath);
  console.log('✓ SRI post-processing completed successfully');
} catch (error) {
  console.error('❌ Failed to add SRI attributes:', error);
  process.exit(1);
}
