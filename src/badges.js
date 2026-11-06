import fs from 'node:fs';
import path from 'node:path';

/**
 * Aggiunge badge dinamici (Shields.io) al README del progetto
 */
export function injectBadgesToReadme(projectName, repoOwner, cwd = process.cwd()) {
  const readmePath = path.join(cwd, 'README.md');
  if (!fs.existsSync(readmePath)) return false;

  let content = fs.readFileSync(readmePath, 'utf-8');

  const badges = `[![GitHub license](https://img.shields.io/github/license/${repoOwner}/${projectName}?style=flat-square)](https://github.com/${repoOwner}/${projectName}/blob/main/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/${repoOwner}/${projectName}?style=flat-square)](https://github.com/${repoOwner}/${projectName}/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/${repoOwner}/${projectName}?style=flat-square)](https://github.com/${repoOwner}/${projectName}/issues)
[![Node.js CI](https://github.com/${repoOwner}/${projectName}/actions/workflows/ci.yml/badge.svg)](https://github.com/${repoOwner}/${projectName}/actions)

`;

  if (content.includes('shields.io')) {
    return false; // Badge già presenti
  }

  // Inserisci subito dopo il titolo H1
  const titleMatch = content.match(/^#\s+.+\n/);
  if (titleMatch) {
    const insertPos = titleMatch[0].length;
    content = content.slice(0, insertPos) + '\n' + badges + content.slice(insertPos);
    fs.writeFileSync(readmePath, content, 'utf-8');
    return true;
  }

  return false;
}
