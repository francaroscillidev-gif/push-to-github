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
  createGitHubRelease
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
  createAndPushTag
} from './git.js';
import { scanForSecrets } from './scanner.js';
import { ensureSmartGitignore } from './gitignore.js';
import { generateSmartCommitMessage, ensureReadme } from './ai-helper.js';

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

export async function handlePush(options = {}) {
  const targetDir = options.dir ? path.resolve(options.dir) : process.cwd();
  const folderName = path.basename(targetDir);
  const isSilent = Boolean(options.yes);

  console.log(chalk.bold.magenta('\n🚀 Push-to-GitHub CLI Automator (v2.0 Pro)\n'));
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
    if (isSilent) {
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
      if (isSilent) {
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

    if (!isSilent) {
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

  // 4. Inizializzazione Git se assente
  let isRepo = isGitRepo(targetDir);
  if (!isRepo) {
    const spinner = ora('Inizializzazione repository Git locale...').start();
    initGitRepo(targetDir, 'main');
    spinner.succeed('Repository Git locale inizializzato (branch main).');
  }

  // 5. SMART .gitignore (Adattivo in base allo stack: Node, Python, iOS, Android, ecc.)
  const gitignoreResult = ensureSmartGitignore(targetDir);
  if (gitignoreResult.created) {
    console.log(chalk.green(`✔ Creato .gitignore su misura per: ${gitignoreResult.detected.join(', ')}`));
  } else if (gitignoreResult.addedCount > 0) {
    console.log(chalk.yellow(`✔ Aggiornato .gitignore con regole per: ${gitignoreResult.detected.join(', ')}`));
  }

  // 6. Generazione automatica README se assente
  if (!isSilent && ensureReadme(options.name || folderName, options.description || '', targetDir)) {
    console.log(chalk.cyan('📄 Creato template iniziale README.md'));
  }

  // 7. Configurazione Remote & Repository su GitHub
  const remotes = getRemotes(targetDir);
  let remoteUrl = remotes.origin;
  let targetRepoName = options.name || folderName;
  let targetOwner = username;

  if (!remoteUrl) {
    let isPrivate = Boolean(options.private);
    let description = options.description || '';

    if (!isSilent) {
      // Controllo se l'utente appartiene a organizzazioni
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

    const spinRepo = ora(`Verifica disponibilità repo ${targetOwner}/${targetRepoName}...`).start();
    const existingRepo = await checkRepositoryExists(octokit, targetOwner, targetRepoName);

    if (existingRepo) {
      spinRepo.info(chalk.blue(`Il repository ${targetOwner}/${targetRepoName} esiste già su GitHub.`));
      if (!isSilent) {
        const { useExisting } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'useExisting',
            message: `Vuoi collegare questo progetto locale al repository esistente?`,
            default: true
          }
        ]);
        if (!useExisting) {
          console.log(chalk.red('Operazione annullata.'));
          process.exit(0);
        }
      }
      remoteUrl = existingRepo.clone_url;
    } else {
      spinRepo.text = `Creazione repository ${targetOwner}/${targetRepoName} su GitHub in corso...`;
      try {
        const newRepo = await createRepository(octokit, {
          name: targetRepoName,
          description,
          isPrivate,
          org: targetOwner !== username ? targetOwner : null
        });
        spinRepo.succeed(chalk.green(`Repository remoto creato con successo: ${newRepo.html_url}`));
        remoteUrl = newRepo.clone_url;
      } catch (err) {
        spinRepo.fail(chalk.red(`Impossibile creare il repository: ${err.message}`));
        process.exit(1);
      }
    }

    const authenticatedUrl = remoteUrl.replace('https://', `https://${encodeURIComponent(token)}@`);
    setRemoteUrl('origin', authenticatedUrl, targetDir);
    console.log(chalk.green(`✔ Remote 'origin' impostato su: ${remoteUrl}`));
  } else {
    console.log(chalk.cyan(`ℹ Remote 'origin' configurato: ${remoteUrl.replace(/\/\/.*@/, '//')}`));
    if (remoteUrl.startsWith('https://') && !remoteUrl.includes('@')) {
      const authenticatedUrl = remoteUrl.replace('https://', `https://${encodeURIComponent(token)}@`);
      setRemoteUrl('origin', authenticatedUrl, targetDir);
    }
  }

  // 8. Messaggio di commit (con supporto Smart AI generator)
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

  // 9. Commit delle modifiche
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

  // 10. Push su GitHub con auto-reconciliation (pull --rebase automatico se ci sono divergenze)
  const currentBranch = getCurrentBranch(targetDir) || 'main';
  const spinPush = ora(`Caricamento (push) su GitHub (${currentBranch})...`).start();
  try {
    pushToRemote('origin', currentBranch, targetDir);
    spinPush.succeed(chalk.green(`Push completato con successo sul branch '${currentBranch}'!`));

    // 11. GitHub Release & Tag opzionale se specificato
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
    console.log(chalk.dim('\nConsiglio: assicurati che il token abbia i permessi "repo".'));
    process.exit(1);
  }
}
