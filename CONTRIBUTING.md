# Guida per i Contributori (Contributing Guidelines)

Grazie per il tuo interesse nel contribuire a **push-to-github (PTG)**! Siamo felici di accogliere miglioramenti, correzioni di bug e nuove funzionalità.

---

## 🛠️ Setup dell'Ambiente Locale

1. **Clona il repository**:
   ```bash
   git clone https://github.com/francaroscillidev-gif/push-to-github.git
   cd push-to-github
   ```

2. **Installa le dipendenze**:
   ```bash
   npm install
   ```

3. **Collega il comando CLI in locale per i test**:
   ```bash
   npm link
   ```
   Ora puoi testare `ptg` o `push-to-github` direttamente nel tuo terminale.

4. **Esegui i test unitari**:
   ```bash
   npm test
   ```

---

## 📐 Flusso di Sviluppo (Pull Request)

1. Crea un branch descrittivo per la tua modifica:
   ```bash
   git checkout -b feature/nuova-funzionalita
   # oppure
   git checkout -b fix/risoluzione-bug
   ```
2. Apporta le modifiche rispettando gli standard di codice ES Modules.
3. Esegui la suite di test (`npm test`) per assicurarti che non ci siano regressioni.
4. Esegui l'audit di salute del repository:
   ```bash
   ptg doctor
   ```
5. Fai commit usando messaggi semantici (Conventional Commits, es. `feat: ...`, `fix: ...`, `docs: ...`).
6. Apri una Pull Request su GitHub descrivendo accuratamente il cambiamento.

---

## 🛡️ Linee Guida per la Sicurezza
- Non committare **mai** token reali o file `.env`.
- Tutte le modifiche allo scanner di sicurezza devono essere coperte da appositi unit test in `test/suite.test.js`.
