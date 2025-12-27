import type { Plugin } from 'vite';
import { createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

interface SRIManifest {
  [filename: string]: {
    integrity: string;
    size: number;
  };
}

/**
 * Vite plugin for generating Subresource Integrity (SRI) hashes
 * Generates sha384 hashes for all bundled assets and creates a manifest
 */
export function viteSRIPlugin(): Plugin {
  let outDir = 'dist';
  const sriManifest: SRIManifest = {};

  return {
    name: 'vite-plugin-sri',
    apply: 'build',

    configResolved(config) {
      outDir = config.build.outDir;
    },

    // Generate SRI hashes for all output files
    generateBundle(_options, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk' || chunk.type === 'asset') {
          const source =
            chunk.type === 'chunk' ? chunk.code : chunk.source;
          const buffer = Buffer.from(source);
          const hash = createHash('sha384').update(buffer).digest('base64');
          const integrity = `sha384-${hash}`;

          sriManifest[fileName] = {
            integrity,
            size: buffer.length,
          };

          // Add comment to chunk with integrity hash
          if (chunk.type === 'chunk') {
            chunk.code = `/* SRI: ${integrity} */\n${chunk.code}`;
          }
        }
      }
    },

    // Write SRI manifest after build completes
    closeBundle() {
      const manifestPath = join(outDir, 'sri-manifest.json');
      writeFileSync(
        manifestPath,
        JSON.stringify(sriManifest, null, 2),
        'utf-8'
      );
      console.log(
        `\n✓ Generated SRI manifest with ${Object.keys(sriManifest).length} entries`
      );
    },

    // Transform index.html to add integrity attributes
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        // This will be called after Vite injects the script/link tags
        // We'll add integrity attributes in a post-processing step
        return html;
      },
    },
  };
}

/**
 * Post-process index.html to add SRI integrity attributes
 * Should be called after build completes
 */
export function addSRIToHTML(
  htmlPath: string,
  sriManifestPath: string
): void {
  const html = readFileSync(htmlPath, 'utf-8');
  const sriManifest: SRIManifest = JSON.parse(
    readFileSync(sriManifestPath, 'utf-8')
  );

  let updatedHTML = html;

  // Add integrity to script tags
  updatedHTML = updatedHTML.replace(
    /<script([^>]*?)src="([^"]+)"([^>]*?)>/g,
    (match, before, src, after) => {
      // Extract filename from src (remove leading /)
      const filename = src.replace(/^\//, '');
      const sri = sriManifest[filename];

      if (sri) {
        // Check if integrity already exists
        if (!match.includes('integrity=')) {
          return `<script${before}src="${src}"${after} integrity="${sri.integrity}" crossorigin="anonymous">`;
        }
      }
      return match;
    }
  );

  // Add integrity to link tags (CSS)
  updatedHTML = updatedHTML.replace(
    /<link([^>]*?)href="([^"]+)"([^>]*?)>/g,
    (match, before, href, after) => {
      // Only process stylesheet links
      if (!match.includes('rel="stylesheet"')) {
        return match;
      }

      const filename = href.replace(/^\//, '');
      const sri = sriManifest[filename];

      if (sri) {
        if (!match.includes('integrity=')) {
          return `<link${before}href="${href}"${after} integrity="${sri.integrity}" crossorigin="anonymous">`;
        }
      }
      return match;
    }
  );

  writeFileSync(htmlPath, updatedHTML, 'utf-8');
  console.log('✓ Added SRI integrity attributes to index.html');
}

/**
 * Generate SHA-384 hash for a buffer
 */
export function generateSRI(content: string | Buffer): string {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const hash = createHash('sha384').update(buffer).digest('base64');
  return `sha384-${hash}`;
}
