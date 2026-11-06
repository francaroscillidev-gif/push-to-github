import fs from 'node:fs';
import path from 'node:path';
import { runGit } from './git.js';

export function generateSmartCommitMessage(cwd = process.cwd()) {
  try {
    const status = runGit('status --porcelain', cwd);
    if (!status) return 'chore: sync project files';

    const lines = status.split('\n').filter(Boolean);
    const addedFiles = [];
    const modifiedFiles = [];
    const deletedFiles = [];

    lines.forEach(line => {
      const code = line.substring(0, 2).trim();
      const filename = line.substring(3).trim();
      if (code === 'A' || code === '??') addedFiles.push(filename);
      else if (code === 'M') modifiedFiles.push(filename);
      else if (code === 'D') deletedFiles.push(filename);
    });

    // Se è il commit iniziale
    let hasCommits = false;
    try {
      runGit('rev-parse --verify HEAD', cwd);
      hasCommits = true;
    } catch {
      hasCommits = false;
    }

    if (!hasCommits) {
      return 'feat: initial project release and configuration';
    }

    if (addedFiles.length > 0 && modifiedFiles.length === 0 && deletedFiles.length === 0) {
      if (addedFiles.length === 1) return `feat: add ${path.basename(addedFiles[0])}`;
      return `feat: add new modules (${addedFiles.slice(0, 3).map(f => path.basename(f)).join(', ')}${addedFiles.length > 3 ? '...' : ''})`;
    }

    if (modifiedFiles.length > 0 && addedFiles.length === 0) {
      if (modifiedFiles.includes('package.json') || modifiedFiles.includes('requirements.txt')) {
        return 'build: update project dependencies and configuration';
      }
      if (modifiedFiles.length === 1) {
        return `update: refine ${path.basename(modifiedFiles[0])}`;
      }
      return `refactor: update ${modifiedFiles.slice(0, 2).map(f => path.basename(f)).join(', ')}`;
    }

    if (deletedFiles.length > 0 && addedFiles.length === 0 && modifiedFiles.length === 0) {
      return `chore: clean up obsolete files (${deletedFiles.slice(0, 2).map(f => path.basename(f)).join(', ')})`;
    }

    return `feat: update project (${lines.length} files changed)`;
  } catch {
    return 'feat: update project files';
  }
}

export function ensureReadme(projectName, description = '', cwd = process.cwd()) {
  const readmePath = path.join(cwd, 'README.md');
  if (fs.existsSync(readmePath)) {
    return false;
  }

  const content = `# ${projectName}

${description ? `> ${description}\n` : ''}
## 📖 Panoramica
Progetto inizializzato e gestito con **[push-to-github](https://github.com/)**.

## 🚀 Primi Passi
1. Clona il repository:
\`\`\`bash
git clone <url-repository>
cd ${projectName}
\`\`\`

2. Installa le dipendenze e avvia il progetto.

## 📄 Licenza
Rilasciato sotto licenza MIT.
`;

  fs.writeFileSync(readmePath, content, 'utf-8');
  return true;
}
