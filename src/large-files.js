import fs from 'node:fs';
import path from 'node:path';

// Limiti di dimensione file raccomandati da GitHub
export const GITHUB_WARN_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB (warning)
export const GITHUB_BLOCK_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100MB (hard limit di GitHub)

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  '.venv',
  'venv',
  'dist',
  'build',
  '.next',
  '.output',
  'DerivedData'
]);

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Scansiona ricorsivamente per rilevare file >50MB e >100MB che bloccherebbero il push di Git su GitHub
 */
export function scanLargeFiles(dirPath, baseDir = dirPath) {
  const largeFiles = [];

  function walk(currentDir) {
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;

      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        try {
          const stats = fs.statSync(fullPath);
          if (stats.size >= GITHUB_WARN_FILE_SIZE_BYTES) {
            largeFiles.push({
              file: relativePath,
              sizeBytes: stats.size,
              formattedSize: formatBytes(stats.size),
              isOverHardLimit: stats.size >= GITHUB_BLOCK_FILE_SIZE_BYTES
            });
          }
        } catch {
          // ignore unreadable files
        }
      }
    }
  }

  walk(dirPath);
  return largeFiles;
}
