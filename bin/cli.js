#!/usr/bin/env node

import { Command } from 'commander';
import { handlePush, handleLogin, handleLogout, handleStatus, handleDoctor, handleListRepos } from '../src/index.js';

const program = new Command();

program
  .name('push-to-github')
  .description('Automazione intelligente per la creazione, gestione e pubblicazione di progetti su GitHub')
  .version('3.0.0');

program
  .command('push', { isDefault: true })
  .description('Carica il progetto su GitHub con scanner di sicurezza, CI/CD e smart commit')
  .option('-d, --dir <path>', 'Percorso della cartella del progetto (default: cartella corrente)')
  .option('-n, --name <name>', 'Nome personalizzato del repository su GitHub')
  .option('-m, --message <msg>', 'Messaggio di commit personalizzato')
  .option('-p, --private', 'Crea il repository come privato')
  .option('-y, --yes', 'Modalità automatica (non interattiva, ideale per script/Antigravity)')
  .option('-a, --ai', 'Usa il generatore di messaggi di commit intelligente')
  .option('-r, --release <version>', 'Crea un Git tag e una GitHub Release (es: 1.0.0 o v1.0.0)')
  .option('--ci', 'Genera automaticamente il workflow GitHub Actions CI/CD')
  .option('--community', 'Genera LICENSE MIT, Issue Templates e PR Template')
  .option('--dry-run', 'Simulazione completa senza effettuare modifiche su GitHub')
  .action((options) => {
    handlePush(options);
  });

program
  .command('status')
  .description('Mostra lo stato locale e di sincronizzazione con GitHub')
  .option('-d, --dir <path>', 'Percorso della cartella del progetto')
  .action((options) => {
    handleStatus(options);
  });

program
  .command('doctor')
  .description('Esegue un audit diagnostico completo della salute Git & GitHub del repository')
  .option('-d, --dir <path>', 'Percorso della cartella del progetto')
  .action((options) => {
    handleDoctor(options);
  });

program
  .command('list')
  .alias('ls')
  .description('Elenca i tuoi repository GitHub con statistiche e link rapidi')
  .option('-l, --limit <num>', 'Numero massimo di repository da mostrare', '15')
  .action((options) => {
    handleListRepos(options);
  });

program
  .command('login')
  .description('Configura o aggiorna il tuo Personal Access Token di GitHub')
  .action(() => {
    handleLogin();
  });

program
  .command('logout')
  .description('Rimuove le credenziali GitHub salvate in locale')
  .action(() => {
    handleLogout();
  });

program.parse(process.argv);
