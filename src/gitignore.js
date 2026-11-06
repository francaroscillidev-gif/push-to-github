import fs from 'node:fs';
import path from 'node:path';

const RULES = {
  common: [
    '# Sistema e Ambienti',
    '.env',
    '.env.*',
    '!.env.example',
    '.DS_Store',
    'Thumbs.db',
    '*.log',
    '*.local',
    '.push-to-github'
  ],
  node: [
    '# Node.js & Javascript',
    'node_modules/',
    'npm-debug.log*',
    'yarn-debug.log*',
    'yarn-error.log*',
    'dist/',
    'build/',
    '.next/',
    '.nuxt/',
    '.output/',
    '.svelte-kit/'
  ],
  python: [
    '# Python',
    '__pycache__/',
    '*.py[cod]',
    '*$py.class',
    '.venv/',
    'venv/',
    'env/',
    'ENV/',
    '.pytest_cache/',
    '.coverage',
    'htmlcov/'
  ],
  ios_macos: [
    '# iOS / Xcode / Swift',
    '*.xcodeproj/*sync*',
    '*.xcworkspace/',
    'xcuserdata/',
    '.build/',
    'DerivedData/'
  ],
  android: [
    '# Android / Kotlin / Java',
    '.gradle/',
    'local.properties',
    '*.apk',
    '*.aab',
    '.idea/'
  ],
  rust: [
    '# Rust',
    'target/'
  ],
  go: [
    '# Go',
    'bin/',
    'pkg/'
  ]
};

export function detectProjectTypes(cwd = process.cwd()) {
  const types = ['common'];
  const files = fs.readdirSync(cwd).map(f => f.toLowerCase());

  if (files.includes('package.json') || files.includes('node_modules')) {
    types.push('node');
  }
  if (files.some(f => f.endsWith('.py') || f === 'requirements.txt' || f === 'pyproject.toml' || f === 'pipfile')) {
    types.push('python');
  }
  if (files.some(f => f.endsWith('.xcodeproj') || f.endsWith('.xcworkspace') || f === 'package.swift')) {
    types.push('ios_macos');
  }
  if (files.includes('android') || files.some(f => f.endsWith('.gradle') || f.endsWith('.gradle.kts') || f === 'gradlew')) {
    types.push('android');
  }
  if (files.includes('cargo.toml')) {
    types.push('rust');
  }
  if (files.includes('go.mod')) {
    types.push('go');
  }

  return types;
}

export function ensureSmartGitignore(cwd = process.cwd()) {
  const gitignorePath = path.join(cwd, '.gitignore');
  const detected = detectProjectTypes(cwd);

  const neededLines = [];
  detected.forEach(type => {
    if (RULES[type]) {
      neededLines.push(...RULES[type]);
    }
  });

  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, neededLines.join('\n') + '\n', 'utf-8');
    return { created: true, detected, addedCount: neededLines.length };
  }

  const existing = fs.readFileSync(gitignorePath, 'utf-8');
  const toAdd = neededLines.filter(line => {
    if (line.startsWith('#') || line.trim() === '') return false;
    return !existing.includes(line);
  });

  if (toAdd.length > 0) {
    const updated = existing.trimEnd() + '\n\n# Aggiunti automaticamente da push-to-github (' + detected.join(', ') + ')\n' + toAdd.join('\n') + '\n';
    fs.writeFileSync(gitignorePath, updated, 'utf-8');
    return { created: false, detected, addedCount: toAdd.length, added: toAdd };
  }

  return { created: false, detected, addedCount: 0 };
}
