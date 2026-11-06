import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function runGit(command, cwd = process.cwd()) {
  try {
    const stdout = execSync(`git ${command}`, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8'
    });
    return stdout ? stdout.trim() : '';
  } catch (error) {
    const stderr = error.stderr ? error.stderr.toString().trim() : '';
    const stdout = error.stdout ? error.stdout.toString().trim() : '';
    throw new Error(stderr || stdout || error.message);
  }
}

export function isGitInstalled() {
  try {
    runGit('--version');
    return true;
  } catch {
    return false;
  }
}

export function isGitRepo(cwd = process.cwd()) {
  try {
    const res = runGit('rev-parse --is-inside-work-tree', cwd);
    return res === 'true';
  } catch {
    return false;
  }
}

export function initGitRepo(cwd = process.cwd(), defaultBranch = 'main') {
  runGit('init', cwd);
  runGit(`branch -M ${defaultBranch}`, cwd);
}

export function getCurrentBranch(cwd = process.cwd()) {
  try {
    return runGit('branch --show-current', cwd) || 'main';
  } catch {
    return 'main';
  }
}

export function getRemotes(cwd = process.cwd()) {
  try {
    const output = runGit('remote -v', cwd);
    const remotes = {};
    if (!output) return remotes;

    output.split('\n').forEach(line => {
      const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
      if (match) {
        remotes[match[1]] = match[2];
      }
    });
    return remotes;
  } catch {
    return {};
  }
}

export function stageAndCommit(message, cwd = process.cwd()) {
  runGit('add .', cwd);
  try {
    const status = runGit('status --porcelain', cwd);
    if (!status) {
      return false;
    }
    runGit(`commit -m "${message.replace(/"/g, '\\"')}"`, cwd);
    return true;
  } catch (err) {
    if (err.message.includes('nothing to commit')) {
      return false;
    }
    throw err;
  }
}

export function setRemoteUrl(remoteName, url, cwd = process.cwd()) {
  const remotes = getRemotes(cwd);
  if (remotes[remoteName]) {
    runGit(`remote set-url ${remoteName} "${url}"`, cwd);
  } else {
    runGit(`remote add ${remoteName} "${url}"`, cwd);
  }
}

export function pullRebase(remoteName = 'origin', branch = 'main', cwd = process.cwd()) {
  try {
    runGit(`pull --rebase ${remoteName} ${branch}`, cwd);
    return true;
  } catch (err) {
    try {
      runGit('rebase --abort', cwd);
    } catch {
      // Ignora
    }
    throw err;
  }
}

export function pushToRemote(remoteName = 'origin', branch = 'main', cwd = process.cwd()) {
  try {
    return runGit(`push -u ${remoteName} ${branch}`, cwd);
  } catch (error) {
    if (error.message.includes('non-fast-forward') || error.message.includes('fetch first') || error.message.includes('Updates were rejected')) {
      pullRebase(remoteName, branch, cwd);
      return runGit(`push -u ${remoteName} ${branch}`, cwd);
    }
    throw error;
  }
}

export function createAndPushTag(tagName, cwd = process.cwd()) {
  try {
    runGit(`tag -a ${tagName} -m "Release ${tagName}"`, cwd);
  } catch {
    // Tag potrebbe già esistere localmente
  }
  return runGit(`push origin ${tagName}`, cwd);
}

/**
 * Ottiene lo status formattato del repository Git per il cruscotto e la visualizzazione
 */
export function getDetailedStatus(cwd = process.cwd()) {
  if (!isGitRepo(cwd)) {
    return { isRepo: false };
  }

  const branch = getCurrentBranch(cwd);
  const remotes = getRemotes(cwd);
  const statusOutput = runGit('status --porcelain', cwd);
  const changedFiles = statusOutput ? statusOutput.split('\n').filter(Boolean) : [];

  let lastCommit = 'Nessun commit ancora';
  try {
    lastCommit = runGit('log -1 --pretty=format:"%h - %s (%cr)"', cwd);
  } catch {
    // repository vuoto
  }

  return {
    isRepo: true,
    branch,
    remotes,
    changedFilesCount: changedFiles.length,
    changedFiles,
    lastCommit
  };
}
