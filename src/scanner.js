import fs from 'node:fs';
import path from 'node:path';

// Regex per segreti comuni ad alto rischio
const SECRET_PATTERNS = [
  { name: 'GitHub Personal Access Token', regex: /gh[pousr]_[A-Za-z0-9_]{36,255}/ },
  { name: 'GitHub Fine-grained PAT', regex: /github_pat_[A-Za-z0-9_]{82}/ },
  { name: 'OpenAI API Key', regex: /sk-[A-Za-z0-9-_]{20,}/ },
  { name: 'Anthropic API Key', regex: /sk-ant-[A-Za-z0-9-_]{20,}/ },
  { name: 'Google Gemini / API Key', regex: /AIza[0-9A-Za-z-_]{30,45}/ },
  { name: 'AWS Access Key ID', regex: /AKIA[0-9A-Z]{16}/ },
  { name: 'Generic Private Key', regex: /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: 'Stripe Secret/Publishable Key', regex: /(sk|pk)_(test|live)_[0-9a-zA-Z]{24,}/ },
  { name: 'Slack Bot/User Token', regex: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*/ }
];

// File o cartelle da ignorare durante la scansione
const IGNORED_PATHS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.venv',
  'venv',
  '__pycache__',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'test'
];

/**
 * Scansiona ricorsivamente una cartella alla ricerca di chiavi API o certificati privati
 */
export function scanForSecrets(dirPath, baseDir = dirPath) {
  const foundSecrets = [];

  function walk(currentDir) {
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      if (IGNORED_PATHS.some(ignored => relativePath === ignored || relativePath.startsWith(ignored + path.sep))) {
        continue;
      }

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        // Ignora file binari o immagini
        const ext = path.extname(entry.name).toLowerCase();
        if (['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.tar', '.gz', '.woff', '.woff2', '.ttf'].includes(ext)) {
          continue;
        }

        // Salta file troppo grandi (> 2MB)
        try {
          const stats = fs.statSync(fullPath);
          if (stats.size > 2 * 1024 * 1024) continue;

          const content = fs.readFileSync(fullPath, 'utf-8');
          for (const pattern of SECRET_PATTERNS) {
            const match = content.match(pattern.regex);
            if (match) {
              foundSecrets.push({
                file: relativePath,
                type: pattern.name,
                snippet: match[0].substring(0, 8) + '...' + match[0].slice(-4)
              });
            }
          }
        } catch {
          // Ignora errori di lettura permessi
        }
      }
    }
  }

  walk(dirPath);
  return foundSecrets;
}
