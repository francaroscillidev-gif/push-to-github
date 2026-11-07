import path from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';

import { loadConfig, saveConfig, deleteToken } from './config.js';
import {
  verifyToken,
  getOctokitClient,
  createRepository,
  checkRepositoryExists,
  getUserOrgs,
  createGitHubRelease,
  listUserRepositories,
  getRepoOverview
} from './github.js';
import {
  isGitInstalled,
  isGitRepo,
  initGitRepo,
  getCurrentBranch,
  getRemotes,
  stageAndCommit,
  setRemoteUrl,
  pushToRemote,
  createAndPushTag,
  getDetailedStatus
} from './git.js';
import { scanForSecrets } from './scanner.js';
import { scanLargeFiles } from './large-files.js';
import { ensureSmartGitignore } from './gitignore.js';
import { generateSmartCommitMessage, ensureReadme } from './ai-helper.js';
import { setupCIWorkflow, setupCommunityTemplates } from './templates.js';
import { openBrowser } from './browser.js';
import { runDoctorAudit } from './doctor.js';

async function promptToken() {
  console.log(chalk.cyan('\n🔑 Configurazione Token GitHub Personal Access (PAT):'));
  console.log(chalk.dim('Per generarlo: GitHub -> Settings -> Developer Settings -> Personal access tokens -> Tokens (classic)'));
  console.log(chalk.dim('Permessi consigliati: ') + chalk.bold('repo') + chalk.dim(' (accesso completo ai repository)\n'));

  const { token } = await inquirer.prompt([
    {
      type: 'password',
      name: 'token',
      message: 'Inserisci il tuo GitHub Personal Access Token:',
      mask: '*',
      validate: (input) => (input && input.trim().length > 0 ? true : 'Il token è obbligatorio.')
    }
  ]);

  const spinner = ora('Verifica del token in corso...').start();
  try {
    const user = await verifyToken(token.trim());
    spinner.succeed(chalk.green(`Autenticato con successo come @${user.login} (${user.name || ''})!`));
    saveConfig({ token: token.trim(), username: user.login });
    return { token: token.trim(), username: user.login };
  } catch (err) {
    spinner.fail(chalk.red('Token non valido o scaduto: ' + err.message));
    process.exit(1);
  }
}

export async function handleLogin() {
  await promptToken();
}

export async function handleLogout() {
  deleteToken();
  console.log(chalk.green('✔ Sessione GitHub eliminata con successo.'));
}

export function handleStatus(options = {}) {
  const targetDir = options.dir ? path.resolve(options.dir) : process.cwd();
  console.log(chalk.bold.magenta('\n📊 Stato Repository Locale & GitHub\n'));
  console.log(chalk.gray(`Cartella: ${targetDir}`));

  const status = getDetailedStatus(targetDir);
  if (!status.isRepo) {
    console.log(chalk.yellow('⚠️ La cartella non è ancora un repository Git.'));
    console.log(chalk.dim('Lancia "ptg" per inizializzarla e pubblicarla in un clic.\n'));
    return;
  }

  console.log(chalk.cyan(`Branch attivo: `) + chalk.bold.white(status.branch));
  console.log(chalk.cyan(`Ultimo commit: `) + chalk.dim(status.lastCommit));

  const remotes = Object.entries(status.remotes);
  if (remotes.length > 0) {
    console.log(chalk.cyan('Remote configurati:'));
    remotes.forEach(([name, url]) => {
      console.log(`  - ${chalk.bold(name)}: ${url.replace(/\/\/.*@/, '//')}`);
    });
  } else {
    console.log(chalk.yellow('Nessun remote collegato.'));
  }

  if (status.changedFilesCount === 0) {
    console.log(chalk.green('\n✔ Albero di lavoro pulito (nessuna modifica non salvata).\n'));
  } else {
    console.log(chalk.yellow(`\n⚠️ Ci sono ${status.changedFilesCount} file con modifiche non committate:`));
    status.changedFiles.slice(0, 5).forEach(f => console.log(chalk.dim(`  ${f}`)));
    if (status.changedFilesCount > 5) {
      console.log(chalk.dim(`  ...e altri ${status.changedFilesCount - 5} file`));
    }
    console.log(chalk.cyan(`\nEsegui ${chalk.bold('ptg')} o ${chalk.bold('ptg -a -y')} per committare e caricare tutto.\n`));
  }
}

export function handleDoctor(options = {}) {
  const targetDir = options.dir ? path.resolve(options.dir) : process.cwd();
  console.log(chalk.bold.magenta('\n🩺 GitHub & Git Health Doctor\n'));
  console.log(chalk.gray(`Analisi per: ${targetDir}\n`));

  const report = runDoctorAudit(targetDir);

  report.checks.forEach(c => {
    let icon = chalk.green('✔');
    if (c.status === 'warn') icon = chalk.yellow('▲');
    else if (c.status === 'fail') icon = chalk.red('✖');

    console.log(`${icon} ${chalk.bold(c.title)}: ${c.detail}`);
    if (c.fixTip) {
      console.log(chalk.dim(`   💡 Suggerimento: ${c.fixTip}`));
    }
  });

  console.log('\n' + chalk.bold(`Punteggio Salute Repository: `) + (
    report.score >= 80 ? chalk.green.bold(`${report.score}/100 - Eccellente`) :
    report.score >= 50 ? chalk.yellow.bold(`${report.score}/100 - Buono ma con avvisi`) :
    chalk.red.bold(`${report.score}/100 - Richiede attenzione`)
  ) + '\n');
}

export async function handleListRepos(options = {}) {
  const config = loadConfig();
  const token = process.env.GITHUB_TOKEN || config.token;

  if (!token) {
    console.error(chalk.red('❌ Token non configurato. Esegui prima "ptg login".'));
    process.exit(1);
  }

  const spinner = ora('Caricamento dei tuoi repository GitHub...').start();
  try {
    const octokit = getOctokitClient(token);
    const repos = await listUserRepositories(octokit, { limit: options.limit ? parseInt(options.limit, 10) : 15 });
    spinner.stop();

    console.log(chalk.bold.magenta(`\n📦 I tuoi repository su GitHub (${repos.length} visualizzati):\n`));
    repos.forEach((r, idx) => {
      const lockIcon = r.private ? chalk.yellow('🔒 Privato') : chalk.green('🌐 Pubblico');
      const stars = r.stargazers_count > 0 ? chalk.cyan(` ⭐ ${r.stargazers_count}`) : '';
      console.log(`${chalk.dim(idx + 1 + '.')} ${chalk.bold.white(r.name)} [${lockIcon}]${stars}`);
      console.log(chalk.dim(`   ${r.html_url}`));
      if (r.description) console.log(chalk.gray(`   "${r.description}"`));
    });
    console.log('');
  } catch (err) {
    spinner.fail(chalk.red(`Impossibile caricare i repository: ${err.message}`));
    process.exit(1);
  }
}

export async function handlePush(options = {}) {
  const targetDir = options.dir ? path.resolve(options.dir) : process.cwd();
  const folderName = path.basename(targetDir);
  const isSilent = Boolean(options.yes);
  const isDryRun = Boolean(options.dryRun);

  if (isDryRun) {
    console.log(chalk.bold.yellow('\n🧪 MODALITÀ SIMULAZIONE (DRY RUN ATTIVO - nessuna modifica reale su GitHub)\n'));
  } else {
    console.log(chalk.bold.magenta('\n🚀 Push-to-GitHub CLI Automator (v3.0 Ultra Pro)\n'));
  }
  console.log(chalk.gray(`Cartella progetto: ${targetDir}`));

  // 1. Controllo installazione Git
  if (!isGitInstalled()) {
    console.error(chalk.red('❌ Git non risulta installato sul tuo sistema. Installa Git per continuare.'));
    process.exit(1);
  }

  // 2. Controllo Autenticazione GitHub
  let config = loadConfig();
  let token = process.env.GITHUB_TOKEN || config.token;
  let username = config.username;

  if (!token) {
    if (isSilent || isDryRun) {
      console.error(chalk.red('❌ Token non configurato. Esegui "ptg login" o imposta GITHUB_TOKEN.'));
      process.exit(1);
    }
    const auth = await promptToken();
    token = auth.token;
    username = auth.username;
  } else if (!username) {
    try {
      const user = await verifyToken(token);
      username = user.login;
      saveConfig({ username });
    } catch {
      if (isSilent || isDryRun) {
        console.error(chalk.red('❌ Token salvato non valido.'));
        process.exit(1);
      }
      console.log(chalk.yellow('⚠️ Token salvato non valido. Richiesta nuovo token...'));
      const auth = await promptToken();
      token = auth.token;
      username = auth.username;
    }
  }

  const octokit = getOctokitClient(token);

  // 3. SCANSIONE DI SICUREZZA (Secrets Detector)
  const spinScan = ora('Scansione di sicurezza per rilevamento chiavi e token sensibili...').start();
  const detectedSecrets = scanForSecrets(targetDir);
  if (detectedSecrets.length > 0) {
    spinScan.warn(chalk.yellow(`Rilevati ${detectedSecrets.length} possibili segreti/chiavi API nei file:`));
    detectedSecrets.forEach(s => {
      console.log(chalk.red(`  [!] ${s.file}: ${s.type} (${s.snippet})`));
    });

    if (!isSilent && !isDryRun) {
      const { proceed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'proceed',
          message: chalk.bold.red('Attenzione: pubblicare segreti su GitHub è rischioso. Vuoi procedere comunque?'),
          default: false
        }
      ]);
      if (!proceed) {
        console.log(chalk.yellow('Operazione interrotta per sicurezza. Aggiungi i file sensibili al .gitignore o rimuovi le chiavi.'));
        process.exit(0);
      }
    }
  } else {
    spinScan.succeed(chalk.green('Scansione di sicurezza superata: nessun segreto ad alto rischio rilevato.'));
  }

  // 4. SCANSIONE FILE DI GRANDI DIMENSIONI (>50MB e >100MB)
  const spinLarge = ora('Scansione delle dimensioni dei file (limiti GitHub)...').start();
  const largeFiles = scanLargeFiles(targetDir);
  const overHardLimit = largeFiles.filter(f => f.isOverHardLimit);

  if (overHardLimit.length > 0) {
    spinLarge.fail(chalk.red(`Bloccato: ${overHardLimit.length} file superano il limite tassativo di 100MB di GitHub:`));
    overHardLimit.forEach(f => {
      console.log(chalk.red(`  [✖] ${f.file}: ${f.formattedSize} (>100MB)`));
    });
    console.log(chalk.yellow('GitHub rifiuterà il push. Aggiungi questi file al .gitignore o usa Git LFS prima di proseguire.'));
    if (!isDryRun) process.exit(1);
  } else if (largeFiles.length > 0) {
    spinLarge.warn(chalk.yellow(`Attenzione: ${largeFiles.length} file superano i 50MB (GitHub mostrerà un warning):`));
    largeFiles.forEach(f => {
      console.log(chalk.yellow(`  [▲] ${f.file}: ${f.formattedSize}`));
    });
  } else {
    spinLarge.succeed(chalk.green('Controllo dimensioni file superato (nessun file > 50MB).'));
  }

  // Se è una simulazione (dry run), mostriamo il resoconto e terminiamo
  if (isDryRun) {
    console.log(chalk.bold.cyan('\n📋 Resoconto Simulazione (Dry Run):'));
    console.log(`- Cartella: ${targetDir}`);
    console.log(`- Utente GitHub: @${username}`);
    console.log(`- Nome repository previsto: ${options.name || folderName}`);
    console.log(`- Visibilità: ${options.private ? 'Privato' : 'Pubblico'}`);
    console.log(`- Messaggio commit generabile: "${generateSmartCommitMessage(targetDir)}"`);
    console.log(chalk.green('\n✔ Nessun errore bloccante. Puoi eseguire "ptg" per pubblicare realmente.\n'));
    return;
  }

  // 5. Inizializzazione Git se assente
  let isRepo = isGitRepo(targetDir);
  if (!isRepo) {
    const spinner = ora('Inizializzazione repository Git locale...').start();
    initGitRepo(targetDir, 'main');
    spinner.succeed('Repository Git locale inizializzato (branch main).');
  }

  // 6. SMART .gitignore (Adattivo in base allo stack)
  const gitignoreResult = ensureSmartGitignore(targetDir);
  if (gitignoreResult.created) {
    console.log(chalk.green(`✔ Creato .gitignore su misura per: ${gitignoreResult.detected.join(', ')}`));
  } else if (gitignoreResult.addedCount > 0) {
    console.log(chalk.yellow(`✔ Aggiornato .gitignore con regole per: ${gitignoreResult.detected.join(', ')}`));
  }

  // 7. Configurazione CI/CD & Community Templates se richiesto
  if (options.ci) {
    const ciRes = setupCIWorkflow(targetDir);
    if (ciRes.created) {
      console.log(chalk.green('✔ Configurato GitHub Actions CI/CD (.github/workflows/ci.yml)'));
    }
  }
  if (options.community) {
    setupCommunityTemplates(targetDir, username);
    console.log(chalk.green('✔ Configurato LICENSE (MIT), Bug Report, Feature Request e PR templates (.github/)'));
  }

  // 8. Generazione automatica README se assente
  if (!isSilent && ensureReadme(options.name || folderName, options.description || '', targetDir)) {
    console.log(chalk.cyan('📄 Creato template iniziale README.md'));
  }

  // 9. Configurazione Remote & Repository su GitHub
  const remotes = getRemotes(targetDir);
  let remoteUrl = remotes.origin;
  let targetRepoName = options.name || folderName;
  let targetOwner = username;

  if (!remoteUrl) {
    let isPrivate = Boolean(options.private);
    let description = options.description || '';

    if (!isSilent) {
      const orgs = await getUserOrgs(octokit);
      const ownerChoices = [
        { name: `Personale (@${username})`, value: username },
        ...orgs.map(o => ({ name: `Organizzazione: ${o.login}`, value: o.login }))
      ];

      const answers = await inquirer.prompt([
        ...(ownerChoices.length > 1 ? [{
          type: 'list',
          name: 'owner',
          message: 'Dove vuoi creare il repository?',
          choices: ownerChoices,
          default: username
        }] : []),
        {
          type: 'input',
          name: 'repoName',
          message: 'Nome del repository su GitHub:',
          default: targetRepoName,
          validate: (input) => (input.trim() ? true : 'Il nome è obbligatorio.')
        },
        {
          type: 'input',
          name: 'description',
          message: 'Descrizione del repository (opzionale):',
          default: description
        },
        {
          type: 'list',
          name: 'visibility',
          message: 'Visibilità repository:',
          choices: [
            { name: 'Pubblico (tutti possono vederlo)', value: 'public' },
            { name: 'Privato (visibile solo a te)', value: 'private' }
          ],
          default: options.private ? 'private' : 'public'
        }
      ]);

      targetOwner = answers.owner || username;
      targetRepoName = answers.repoName.trim();
      description = answers.description;
      isPrivate = answers.visibility === 'private';
    }

    const spinRepo = ora(`Verifica repository ${targetOwner}/${targetRepoName}...`).start();
    const existingRepo = await checkRepositoryExists(octokit, targetOwner, targetRepoName);

    if (existingRepo) {
      spinRepo.info(chalk.blue(`Il repository ${targetOwner}/${targetRepoName} esiste già su GitHub.`));
      remoteUrl = existingRepo.clone_url;
    } else {
      spinRepo.text = `Creazione repository ${targetOwner}/${targetRepoName} su GitHub...`;
      try {
        const newRepo = await createRepository(octokit, {
          name: targetRepoName,
          description,
          isPrivate,
          org: targetOwner !== username ? targetOwner : null
        });
        spinRepo.succeed(chalk.green(`Repository remoto creato: ${newRepo.html_url}`));
        remoteUrl = newRepo.clone_url;
      } catch (err) {
        spinRepo.fail(chalk.red(`Impossibile creare il repository: ${err.message}`));
        if (err.message.includes('secondary rate limit')) {
          console.log(chalk.yellow('\n💡 GitHub ha limitato temporaneamente la creazione automatica via API.'));
          const createUrl = `https://github.com/new?name=${encodeURIComponent(targetRepoName)}&description=${encodeURIComponent(description)}`;
          console.log(chalk.cyan(`Apertura pagina per completare con 1 clic: ${createUrl}`));
          openBrowser(createUrl);
        }
        process.exit(1);
      }
    }

    const authenticatedUrl = remoteUrl.replace('https://', `https://${encodeURIComponent(token)}@`);
    setRemoteUrl('origin', authenticatedUrl, targetDir);
    console.log(chalk.green(`✔ Remote 'origin' impostato su: ${remoteUrl}`));
  } else {
    const cleanOrigin = remoteUrl.replace(/\/\/.*@/, '//');
    console.log(chalk.cyan(`ℹ Remote 'origin' configurato: ${cleanOrigin}`));
    if (remoteUrl.startsWith('https://') && !remoteUrl.includes('@')) {
      const authenticatedUrl = remoteUrl.replace('https://', `https://${encodeURIComponent(token)}@`);
      setRemoteUrl('origin', authenticatedUrl, targetDir);
    }
  }

  // 10. Messaggio di commit (con supporto Smart AI generator)
  let commitMessage = options.message;
  if (!commitMessage) {
    const suggestedMessage = generateSmartCommitMessage(targetDir);
    if (isSilent || options.ai) {
      commitMessage = suggestedMessage;
    } else {
      const { msg } = await inquirer.prompt([
        {
          type: 'input',
          name: 'msg',
          message: 'Messaggio di commit (suggerito in automatico):',
          default: suggestedMessage
        }
      ]);
      commitMessage = msg;
    }
  }

  // 11. Commit delle modifiche
  const spinCommit = ora('Preparazione e commit delle modifiche...').start();
  try {
    const committed = stageAndCommit(commitMessage, targetDir);
    if (committed) {
      spinCommit.succeed(chalk.green(`Commit completato: "${commitMessage}"`));
    } else {
      spinCommit.info(chalk.yellow('Nessuna modifica recente da committare, si procede con il push.'));
    }
  } catch (err) {
    spinCommit.fail(chalk.red(`Errore durante il commit: ${err.message}`));
    process.exit(1);
  }

  // 12. Push su GitHub con auto-reconciliation
  const currentBranch = getCurrentBranch(targetDir) || 'main';
  const spinPush = ora(`Caricamento (push) su GitHub (${currentBranch})...`).start();
  try {
    pushToRemote('origin', currentBranch, targetDir);
    spinPush.succeed(chalk.green(`Push completato con successo sul branch '${currentBranch}'!`));

    // 13. GitHub Release & Tag opzionale
    if (options.release) {
      const tagName = options.release.startsWith('v') ? options.release : `v${options.release}`;
      const spinRel = ora(`Creazione Release e Tag ${tagName}...`).start();
      try {
        createAndPushTag(tagName, targetDir);
        await createGitHubRelease(octokit, {
          owner: targetOwner,
          repo: targetRepoName,
          tag: tagName,
          name: `Release ${tagName}`,
          body: `🚀 Rilascio di versione ${tagName} generato automaticamente da push-to-github.`
        });
        spinRel.succeed(chalk.green(`GitHub Release ${tagName} creata con successo!`));
      } catch (relErr) {
        spinRel.warn(chalk.yellow(`Tag creato ma release non pubblicata: ${relErr.message}`));
      }
    }

    const cleanUrl = remoteUrl.replace(/\/\/.*@/, '//').replace(/\.git$/, '');
    console.log('\n' + chalk.bold.green('🎉 PROGETTO CARICATO E SINCRONIZZATO CON SUCCESSO!'));
    console.log(chalk.cyan(`🔗 Repository: ${cleanUrl}\n`));
  } catch (err) {
    spinPush.fail(chalk.red(`Errore durante il push su GitHub: ${err.message}`));
    if (err.message.includes('Repository not found')) {
      console.log(chalk.yellow('\n💡 Il repository remoto non esiste ancora su GitHub.'));
      const fallbackUrl = `https://github.com/new?name=${targetRepoName}`;
      console.log(chalk.cyan(`Premi "Create repository" nella pagina aperta del browser: ${fallbackUrl}`));
      openBrowser(fallbackUrl);
    }
    process.exit(1);
  }
}
