import fs from 'node:fs';
import path from 'node:path';
import { runGit } from './git.js';

/**
 * Aggiorna o crea il file CHANGELOG.md in base allo storico git
 */
export function updateChangelog(version = '1.0.0', cwd = process.cwd()) {
  const changelogPath = path.join(cwd, 'CHANGELOG.md');
  const today = new Date().toISOString().split('T')[0];

  let commits = [];
  try {
    const rawCommits = runGit('log -15 --pretty=format:"* %s (%h)"', cwd);
    commits = rawCommits ? rawCommits.split('\n').filter(Boolean) : [];
  } catch {
    commits = ['* Rilascio iniziale del progetto'];
  }

  const newSection = `## [${version}] - ${today}\n\n### Modifiche e Novità\n` + commits.join('\n') + '\n\n';

  if (fs.existsSync(changelogPath)) {
    const current = fs.readFileSync(changelogPath, 'utf-8');
    if (!current.includes(`## [${version}]`)) {
      const headerIndex = current.indexOf('\n\n');
      if (headerIndex !== -1) {
        const updated = current.slice(0, headerIndex + 2) + newSection + current.slice(headerIndex + 2);
        fs.writeFileSync(changelogPath, updated, 'utf-8');
        return true;
      }
    }
    return false;
  } else {
    const initialContent = `# Changelog

Tutti i cambiamenti e le versioni di questo progetto sono documentati in questo file.

${newSection}`;
    fs.writeFileSync(changelogPath, initialContent, 'utf-8');
    return true;
  }
}
