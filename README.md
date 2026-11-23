# Study Hall

**[Download the Windows installer](https://github.com/iNemesisX/study-hall/releases/latest)** (StudyHall Installer.exe). Windows may show "Windows protected your PC" because the app isn't code-signed: click **More info → Run anyway**.

Class notebooks that turn photos of slides, textbook pages and handwritten work into organized notes,
then into flashcards, practice tests and study guides. (Formerly StudyDeck.)

## Run from source

Needs [Node.js](https://nodejs.org) 18+.

```
npm install
npm start
```

## Build the installer to share

On a Windows PC:

```
npm run dist
```

This writes `dist/StudyHall Installer.exe` with the icon in `build/icon.ico`. On Linux or macOS, `npm run dist:linux` builds the same kind of installer with `makensis` (install the `nsis` package first); that is how the shipped installer was made. The installer is not
code-signed, so Windows SmartScreen warns on first run ("More info" → "Run anyway").

## How it is laid out

- **Left:** notebook picker (one notebook per class), then sections and pages side by side.
- **Ribbon:** Home (font, format, highlight, comment, PDF) · Insert (photos, phone camera, turn photos into notes) ·
  Draw (pens, eraser, undo) · Study (flashcards: generate from notes, type by hand, or import from Quizlet; practice test; study guide) · Help (tour, feature guide, AI setup, backup).
- **Guided tour:** plays every time the app opens (untick "Show this tour every time Study Hall opens", or use Help → Tour at startup, to stop it). It has three parts: Notes; Flashcards and studying; Setup and help. Users click through a sample class and can jump straight to any part.
- **FAQ:** Help → FAQ, or the ? button. Searchable, with step-by-step instructions for getting and connecting a Gemini, Claude or Ollama API key. The same text is in [docs/FAQ.md](docs/FAQ.md).

## AI options (AI setup, top right)

Step-by-step key instructions for each option are in the [FAQ](docs/FAQ.md#ai-and-api-keys).

| Option | Cost | Notes |
| --- | --- | --- |
| Google Gemini (default) | Free | Free key from aistudio.google.com/apikey. Daily limits. Free-tier content may be used by Google to improve its products. |
| Ollama (on this computer) | Free | Offline and private. Needs a strong PC and `ollama pull qwen3-vl:8b`. |
| Anthropic Claude | Paid per use | Most accurate. Key from console.anthropic.com. |

"Find models" in AI setup lists the models your key or Ollama install offers, so the model name can be changed
without editing code. Defaults are in `notes/main.js` (`DEFAULTS`).

## Where things are in the code

| File | Purpose |
| --- | --- |
| `main.js`, `preload.js` | Window, flashcard data file, one-time copy of old StudyDeck data |
| `notes/main.js` | Notebook / page / photo storage, AI settings, PDF export |
| `notes/ai.js` | Gemini, Ollama and Claude requests; prompts for notes, flashcards and study guides |
| `notes/capture.js` | QR code and the phone upload server |
| `src/js/app.js` | Routes and start-up |
| `src/js/views/nav.js`, `ribbon.js` | Navigation pane, app bar, ribbon |
| `src/js/views/page.js` | The page: photos, notes, text and ink annotation |
| `src/js/views/study.js` | Flashcards, practice test and study guide from notes; Study tools page |
| `src/js/views/help.js` | Guided tour, feature guide (`FEATURES`), FAQ dialog, backup |
| `src/js/faq.js` | FAQ text. `npm run docs` regenerates `docs/FAQ.md` from it |
| `src/js/notes/sample.js` | The Welcome notebook |
| `src/js/views/set.js`, `learn.js`, `write.js`, `test.js`, `flashcards.js`, `editor.js` | The flashcard study modes from StudyDeck, unchanged |
| `test/smoke-main.js` | End-to-end check: `npm run smoke` |

## Data

- Flashcard sets: `%APPDATA%/Study Hall/studyhall-data.json` (Help → Backup exports this).
- Notebooks: `%APPDATA%/Study Hall/notebooks/<id>/` with `notebook.json`, `pages/`, `images/`. Not part of the backup file; copy the folder.
- On first launch, sets and notebooks from an existing StudyDeck install are copied across. The old folder is left untouched.
