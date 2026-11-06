import { execSync } from 'node:child_process';
import os from 'node:os';

/**
 * Apre una pagina web nel browser predefinito dell'utente
 */
export function openBrowser(url) {
  try {
    const platform = os.platform();
    if (platform === 'darwin') {
      execSync(`open "${url}"`);
    } else if (platform === 'win32') {
      execSync(`start "" "${url}"`);
    } else {
      execSync(`xdg-open "${url}"`);
    }
    return true;
  } catch {
    return false;
  }
}
