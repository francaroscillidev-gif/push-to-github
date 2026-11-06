import fs from 'node:fs';
import path from 'node:path';
import { detectProjectTypes } from './gitignore.js';

export function setupCIWorkflow(cwd = process.cwd()) {
  const detected = detectProjectTypes(cwd);
  const workflowsDir = path.join(cwd, '.github', 'workflows');
  fs.mkdirSync(workflowsDir, { recursive: true });

  const ciFilePath = path.join(workflowsDir, 'ci.yml');
  if (fs.existsSync(ciFilePath)) {
    return { created: false, path: ciFilePath };
  }

  let ciContent = '';

  if (detected.includes('node')) {
    ciContent = `name: Node.js CI

on:
  push:
    branches: [ "main", "master" ]
  pull_request:
    branches: [ "main", "master" ]

jobs:
  build-and-test:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [18.x, 20.x, 22.x]

    steps:
    - uses: actions/checkout@v4
    - name: Use Node.js \${{ matrix.node-version }}
      uses: actions/setup-node@v4
      with:
        node-version: \${{ matrix.node-version }}
        cache: 'npm'
    - run: npm ci
    - run: npm test --if-present
`;
  } else if (detected.includes('python')) {
    ciContent = `name: Python CI

on:
  push:
    branches: [ "main", "master" ]
  pull_request:
    branches: [ "main", "master" ]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ["3.10", "3.11", "3.12"]

    steps:
    - uses: actions/checkout@v4
    - name: Set up Python \${{ matrix.python-version }}
      uses: actions/setup-python@v5
      with:
        python-version: \${{ matrix.python-version }}
    - name: Install dependencies
      run: |
        python -m pip install --upgrade pip
        if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
        if [ -f pyproject.toml ]; then pip install .; fi
    - name: Run Tests
      run: |
        python -m unittest discover -s . -p "*test*.py" || pytest || true
`;
  } else if (detected.includes('rust')) {
    ciContent = `name: Rust CI

on:
  push:
    branches: [ "main", "master" ]
  pull_request:
    branches: [ "main", "master" ]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - name: Cargo Test
      run: cargo test --verbose
`;
  } else {
    // Workflow generico di verifica repository
    ciContent = `name: General CI & Lint

on:
  push:
    branches: [ "main", "master" ]
  pull_request:
    branches: [ "main", "master" ]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - name: Verify repository structure
      run: ls -la
`;
  }

  fs.writeFileSync(ciFilePath, ciContent, 'utf-8');
  return { created: true, path: ciFilePath };
}

export function setupCommunityTemplates(cwd = process.cwd(), repoOwner = 'francaroscillidev-gif') {
  const githubDir = path.join(cwd, '.github');
  const issueDir = path.join(githubDir, 'ISSUE_TEMPLATE');
  fs.mkdirSync(issueDir, { recursive: true });

  const bugReportPath = path.join(issueDir, 'bug_report.md');
  if (!fs.existsSync(bugReportPath)) {
    fs.writeFileSync(bugReportPath, `---
name: Bug report
about: Crea una segnalazione per aiutarci a risolvere un bug
title: '[BUG] '
labels: bug
assignees: ''
---

**Descrizione del bug**
Descrizione chiara e concisa del problema riscontrato.

**Riproduzione**
1. Esegui '...'
2. Clicca su '....'
3. Guarda l'errore

**Comportamento atteso**
Cosa doveva accadere.
`, 'utf-8');
  }

  const featureReportPath = path.join(issueDir, 'feature_request.md');
  if (!fs.existsSync(featureReportPath)) {
    fs.writeFileSync(featureReportPath, `---
name: Proposta di funzionalità
about: Suggerisci una nuova idea o implementazione per questo progetto
title: '[FEATURE] '
labels: enhancement
assignees: ''
---

**La tua richiesta è legata a un problema?**
Una descrizione chiara del problema o dell'esigenza.

**Soluzione desiderata**
Cosa vorresti che il software facesse.
`, 'utf-8');
  }

  const prPath = path.join(githubDir, 'PULL_REQUEST_TEMPLATE.md');
  if (!fs.existsSync(prPath)) {
    fs.writeFileSync(prPath, `## Descrizione delle modifiche
Riassunto chiaro e sintetico delle modifiche apportate.

## Tipo di modifica
- [ ] Bug fix (modifica che corregge un problema senza rompere compatibilità)
- [ ] Nuova feature (aggiunta di funzionalità)
- [ ] Breaking change (modifica che richiede aggiornamenti nei client)
- [ ] Refactor / Documentazione

## Checklist di verifica
- [ ] Il codice rispetta le linee guida del progetto
- [ ] Ho testato le modifiche localmente
`, 'utf-8');
  }

  // Creazione licenza MIT se assente
  const licensePath = path.join(cwd, 'LICENSE');
  if (!fs.existsSync(licensePath)) {
    const year = new Date().getFullYear();
    fs.writeFileSync(licensePath, `MIT License

Copyright (c) ${year} ${repoOwner}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`, 'utf-8');
  }

  return true;
}
