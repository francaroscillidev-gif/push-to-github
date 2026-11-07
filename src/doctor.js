import fs from 'node:fs';
import path from 'node:path';
import { runGit, isGitRepo } from './git.js';
import { scanForSecrets } from './scanner.js';
import { scanLargeFiles } from './large-files.js';
import { detectProjectTypes } from './gitignore.js';
import { loadConfig } from './config.js';

export function runDoctorAudit(cwd = process.cwd()) {
  const report = {
    timestamp: new Date().toISOString(),
    cwd,
    checks: [],
    score: 100
  };

  function addCheck(title, status, detail, fixTip = null) {
    report.checks.push({ title, status, detail, fixTip });
    if (status === 'fail') report.score -= 25;
    else if (status === 'warn') report.score -= 10;
  }

  // 1. Git installato e repo inizializzato
  const inRepo = isGitRepo(cwd);
  if (inRepo) {
    addCheck('Git Repository', 'pass', 'Repository Git locale valido e configurato.');
  } else {
    addCheck('Git Repository', 'fail', 'Nessun repository Git rilevato nella cartella.', 'Esegui "ptg" per inizializzare automaticamente.');
  }

  // 2. Controllo Autenticazione GitHub
  const config = loadConfig();
  const token = process.env.GITHUB_TOKEN || config.token;
  if (token) {
    addCheck('GitHub Token', 'pass', `Token configurato per l'utente @${config.username || 'autenticato'}.`);
  } else {
    addCheck('GitHub Token', 'fail', 'Nessun GitHub Personal Access Token salvato.', 'Esegui "ptg login" per inserire il token.');
  }

  // 3. Controllo .gitignore
  const gitignorePath = path.join(cwd, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    const hasEnv = content.includes('.env');
    const hasNode = content.includes('node_modules');
    if (hasEnv && hasNode) {
      addCheck('.gitignore Security', 'pass', '.gitignore presente con protezioni per file .env e node_modules.');
    } else {
      addCheck('.gitignore Security', 'warn', '.gitignore presente ma potrebbe mancare la protezione per .env o node_modules.', 'Esegui "ptg" per aggiornarlo automaticamente.');
    }
  } else {
    addCheck('.gitignore Security', 'warn', 'File .gitignore assente.', 'Esegui "ptg" per crearlo su misura per lo stack.');
  }

  // 4. Scanner Segreti & Credenziali
  const secrets = scanForSecrets(cwd);
  if (secrets.length === 0) {
    addCheck('Secrets & API Keys Scan', 'pass', 'Nessun token o chiave privata rilevata nei file del progetto.');
  } else {
    addCheck('Secrets & API Keys Scan', 'fail', `Trovati ${secrets.length} potenziali segreti nei sorgenti!`, `File coinvolti: ${secrets.map(s => s.file).join(', ')}`);
  }

  // 5. Scanner File Giganti (>50MB e >100MB)
  const large = scanLargeFiles(cwd);
  const overHard = large.filter(f => f.isOverHardLimit);
  if (overHard.length > 0) {
    addCheck('Large File Hard Limit', 'fail', `${overHard.length} file superano i 100MB (GitHub rifiuterà il push).`, `File: ${overHard.map(f => `${f.file} (${f.formattedSize})`).join(', ')}`);
  } else if (large.length > 0) {
    addCheck('Large File Warning', 'warn', `${large.length} file superano i 50MB (GitHub mostrerà un avviso).`, `Considera Git LFS per: ${large.map(f => f.file).join(', ')}`);
  } else {
    addCheck('File Size Limits', 'pass', 'Tutti i file sono al di sotto dei limiti raccomandati da GitHub.');
  }

  // 6. Presenza README.md e LICENSE
  const hasReadme = fs.existsSync(path.join(cwd, 'README.md'));
  const hasLicense = fs.existsSync(path.join(cwd, 'LICENSE'));
  if (hasReadme && hasLicense) {
    addCheck('Open Source Documentation', 'pass', 'README.md e LICENSE (MIT) presenti.');
  } else if (!hasReadme) {
    addCheck('Open Source Documentation', 'warn', 'README.md mancante.', 'Crea un README.md o usa "ptg" per generarlo automaticamente.');
  } else {
    addCheck('Open Source Documentation', 'warn', 'LICENSE mancante.', 'Esegui "ptg --community" per aggiungere la licenza MIT.');
  }

  // 7. Stack rilevato
  const stack = detectProjectTypes(cwd);
  addCheck('Tech Stack Detection', 'pass', `Stack rilevato: ${stack.join(', ')}`);

  report.score = Math.max(0, report.score);
  return report;
}
