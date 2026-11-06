# 🚀 push-to-github

Uno strumento CLI basato su Node.js/npm per **automatizzare completamente il processo di creazione e caricamento di qualsiasi progetto su GitHub**.

---

## 🌟 Funzionalità

- **Creazione Automatica Repository**: Crea direttamente il repository su GitHub (pubblico o privato) tramite API senza dover aprire il browser.
- **Inizializzazione Git**: Esegue automaticamente `git init` e imposta il branch predefinito su `main`.
- **Protezione File (`.gitignore`)**: Genera o aggiorna automaticamente il file `.gitignore` per escludere `node_modules`, `.env`, `.DS_Store`, file di build e token.
- **Commit & Push automatico**: Aggiunge i file (`git add .`), crea il commit con il tuo messaggio ed effettua il `git push` sul branch remoto.
- **Autenticazione sicura**: Salva in locale il tuo GitHub Personal Access Token (PAT) per non doverlo reinserire ad ogni push.
- **Modalità interattiva & comandi rapidi**: Puoi eseguire il tool in modalità guidata o passare direttamente parametri via CLI (`--name`, `--message`, `--private`).

---

## 📦 Installazione

### Metodo 1: Installazione Globale (Consigliato per usarlo ovunque)
Dalla cartella del progetto:
```bash
npm link
```
Ora puoi lanciare semplicemente `push-to-github` o l'abbreviazione `ptg` da qualsiasi cartella del tuo computer!

Oppure:
```bash
npm install -g .
```

---

## 🔑 Primo Accesso (Personal Access Token)

1. Vai su GitHub: **Settings** → **Developer Settings** → **Personal Access Tokens** → **Tokens (classic)**.
   - [Genera Token Diretto](https://github.com/settings/tokens/new)
2. Assegna il permesso (scope): **`repo`** (accesso completo ai repository).
3. Esegui nella CLI:
   ```bash
   push-to-github login
   ```
   e incolla il token generato. Verrà salvato in sicurezza nella tua home (`~/.push-to-github/config.json`).

---

## 🛠️ Come si usa

### 1. Carica il progetto corrente (interattivo)
Entra nella cartella di un qualsiasi progetto e lancia:
```bash
push-to-github
# oppure semplicemente
ptg
```
La CLI ti chiederà se non già presente:
- Nome del repository su GitHub
- Descrizione
- Se renderlo Pubblico o Privato
- Messaggio di commit

Fa tutto da solo: `git init`, `.gitignore`, creazione su GitHub, `git remote add`, `git commit`, `git push`!

---

### 2. Carica con opzioni veloci da riga di comando
```bash
# Specifica nome e messaggio
push-to-github -n "mio-fantastico-progetto" -m "Primo rilascio v1.0"

# Crea un repository privato
push-to-github -p -m "Inizializzazione progetto privato"

# Carica un progetto in un'altra cartella
push-to-github -d /percorso/mio-progetto -m "Caricamento automatico"
```

---

### 3. Comandi disponibili

| Comando | Descrizione |
|---|---|
| `push-to-github` o `ptg` | Avvia la procedura guidata di push sul progetto corrente |
| `push-to-github login` | Configura o aggiorna il tuo GitHub Personal Access Token |
| `push-to-github logout` | Rimuove le credenziali salvate in locale |
| `push-to-github --help` | Mostra tutte le opzioni e i comandi disponibili |

---

## 🛡️ Sicurezza
Non invia né condivide il tuo token con server terzi: le richieste API vanno direttamente a `https://api.github.com` via libreria ufficiale `@octokit/rest`.
