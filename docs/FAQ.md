# Study Hall: Frequently asked questions

This page is generated from `src/js/faq.js`, the same text shown in the app under **Help → FAQ**.

## AI and API keys

### Does Study Hall cost anything to use?

No. The app is free, and so are two of its three AI options:

1. **Google Gemini** (the default) is free with a Google account. It has daily usage limits that are plenty for normal studying.
2. **On this computer (Ollama)** is free and works offline, but needs a powerful PC.
3. **Anthropic Claude** is paid per use and gives the most accurate notes.

You only need an AI for writing notes from photos, generating flashcards and writing study guides. Typing notes, drawing, studying flashcards and taking tests work without one.

### What is an API key?

An API key is a long password that lets Study Hall use an AI service on your behalf. Each person gets their own key from the AI company and pastes it into Study Hall once.

> Treat it like a password: don't post it online or share it. If it leaks, delete it on the provider's website and create a new one.

### How do I get a free Gemini API key and connect it?

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and sign in with a Google account. If you're asked to accept the terms, accept them.
2. Click **Create API key**. If it asks for a project, pick the default one or let it create a new one.
3. Click **Copy** next to the new key.
4. In Study Hall, click the **AI** button at the top right (or **Help → AI setup**).
5. Choose **Google Gemini**, paste the key into **API key**, and click **Test connection**.
6. When it says **Connected**, click **Save**.

Free keys have daily limits that reset at midnight Pacific time. On the free tier, Google may use what you send to improve its products, so don't photograph anything private.

> School Google accounts sometimes block AI Studio. If yours does, use a personal Google account.

### How do I get a Claude API key and connect it?

1. Go to [console.anthropic.com](https://console.anthropic.com) and create an account or sign in.
2. Open **Billing** and add credit. Claude is paid per use; a few dollars lasts a long time for notes.
3. Open **API keys** and click **Create key**. Give it a name like "Study Hall".
4. Copy the key straight away. It is shown only once.
5. In Study Hall, click the **AI** button at the top right, choose **Anthropic Claude**, paste the key and click **Test connection**.
6. When it says **Connected**, click **Save**.

You can set a monthly spending limit in the Anthropic console so you are never charged more than you expect.

### How do I run the AI on my own computer (Ollama)?

This is free, private and works without internet, but it needs a strong PC: ideally a graphics card with about 8 GB of memory or more. It is slower than the online options and less accurate on handwriting.

1. Download and install Ollama from [ollama.com/download](https://ollama.com/download).
2. Open **Command Prompt** (or Terminal) and run **ollama pull qwen3-vl:8b**. This downloads the model, which is several gigabytes.
3. Make sure Ollama is running (it starts automatically after install and shows an icon in the system tray).
4. In Study Hall, click the **AI** button at the top right and choose **On this computer (Ollama)**.
5. Leave the address as **http://localhost:11434** and click **Test connection**, then **Save**.

Any Ollama model that can read images works. Click **Find models** in AI setup to pick from the ones you have downloaded.

The local model does almost everything: notes from photos and documents, **Ask AI** (including pictures and boxed areas), flashcards, tests and study guides, with no daily limit and nothing leaving your computer. Answers are slower than Gemini or Claude on most PCs.

> **Recordings and dictation still need a free Gemini key**, because local models can't listen to audio. Once a recording is written out, the notes from it are made by your local model. PDFs are read as page images (first 20 pages).

**On an Android tablet**, run Ollama on a computer on the same Wi-Fi and enter that computer's address in AI setup (for example **http://192.168.1.10:11434**). On the PC, set the environment variable **OLLAMA_HOST=0.0.0.0** and restart Ollama so other devices can reach it. The iPad and browser versions can't use Ollama.

### Which AI option should I choose?

Start with **Google Gemini**: it is free and good enough for most slides and printed pages.

Switch to **Claude** if your notes are mostly messy handwriting or dense diagrams and Gemini keeps missing things. Use **Ollama** (a local model on your own computer) if you want nothing to leave your computer and no daily limit, and your PC is powerful enough. It runs Ask AI too, but recordings and dictation still use Gemini.

You can switch at any time in AI setup. Notes you already made are kept.

### Can AI-generated notes, flashcards or study guides be wrong?

Yes. AI models can misread a photo, mix up details or state something that sounds right but isn't. Everything the AI writes in Study Hall is marked in the app with a ✨ notice naming the AI service and model that wrote it, for example "Notes on this page were written with Google Gemini (gemini-3.5-flash)". The notice is left out of PDF exports.

1. Check notes against the original slides or textbook, especially numbers, formulas, names and dates. The photos stay on the page so you can compare.
2. Fix mistakes directly: click and type. Your edits are used for flashcards and study guides made afterwards.
3. Redrawn diagrams are simplified schematics marked "AI-drawn". Compare their labels and arrows with the original photo.
4. If a page has many mistakes, try **Exhaustive** detail or a more accurate AI option in AI setup, then **Insert → Rewrite all**.

> Treat AI notes as a first draft to study from, not as the final word. When the AI and your teacher disagree, go with your teacher.

### Where is my API key stored? Is it safe?

Your key is saved only on your computer, encrypted with your Windows account. Study Hall sends it only to the company that issued it (Google or Anthropic), and only when you generate something.

To remove it, open AI setup and click **Remove key**. You can also delete the key on the provider's website, which stops it working everywhere.

### It says "The API key was rejected" or "Model not found".

1. Open AI setup and paste the key again. Make sure you copied the whole key with no spaces.
2. Check the key still exists on the provider's website (Google AI Studio or the Anthropic console).
3. For "Model not found", click **Find models** and pick one from the list. AI companies retire old model names from time to time.
4. Click **Test connection** to confirm, then **Save**.

### It says "The free Gemini limit was reached".

The free tier allows a limited number of requests per minute and per day. Wait a minute and try again. If it keeps happening, you have used the day's allowance; it resets at midnight Pacific time.

To use less: turn photos into notes a handful at a time rather than one by one, turn off **Draw clean versions of diagrams** in AI setup, or switch to another model, Ollama or Claude.

### How do I know when I'm close to my AI limit?

The **AI** button at the top right shows how many requests you have used today, for example "12/20 today". It turns yellow when you pass three quarters of the limit, and a warning bar appears under the toolbar with how many requests are left and when the limit resets. A second warning appears at 90%, and a red one when the limit is used up.

Before an action that needs several requests, Study Hall also checks what is left and asks before continuing if it might not be enough.

Google does not tell apps how much of the free allowance is left, so Study Hall counts its own requests. It starts from an estimate of 20 a day for free Gemini Flash models and corrects it from Google's own message the first time a limit is reached. Your real limits are listed at [aistudio.google.com/rate-limit](https://aistudio.google.com/rate-limit); you can type the number into **AI setup → Daily request limit** to make the warning exact. For Claude, set a daily budget in AI setup to get the same warnings.

> Requests made with the same key in other apps are not counted, and limits are per model, so switching model in AI setup gives you that model's separate allowance.

## Photos and notes

### The phone camera QR code doesn't connect.

1. Make sure the phone and the computer are on the **same Wi-Fi network** (not mobile data).
2. If Windows asked whether to allow Study Hall on networks, choose **Private networks** and allow it.
3. If the dialog shows a "Not connecting? Try another network" list, pick a different entry and scan again.
4. Keep the QR window open on the computer while taking photos. Closing it ends the session.

School, work and public Wi-Fi often block devices from reaching each other. On those networks, take the photos normally and transfer them, or use **Insert → Photos**.

### My iPhone photos won't add.

iPhones save photos as HEIC, which Windows can't always read. Either use **Insert → Phone camera** (it converts photos automatically), or on the iPhone go to **Settings → Camera → Formats** and choose **Most Compatible** so new photos are saved as JPEG.

### The notes missed something or got it wrong.

You can edit anything on the page: click and type. To get better notes next time:

1. Take photos straight on, in good light, with the whole slide or page in frame.
2. In AI setup, set **Note detail** to **Exhaustive**.
3. Use **Insert → Rewrite all** to write the page again from its photos.
4. For handwriting, Claude is the most accurate option.

### How do I add a picture or diagram to my notes?

1. Go to **Insert → Picture** and choose an image. Or drag an image onto your notes (or paste one) and choose **Place in my notes as a picture**.
2. Click the picture to select it. Drag it to move it; drag the round handle at its corner to resize it.
3. To write on it, click **Draw on it** (or open the Draw tab) and draw. The ink stays attached when you move the picture.
4. Press **Delete**, or the bin button above the picture, to remove it.

### What are Clippings and clean diagrams?

When you turn photos into notes, the AI also looks for diagrams, charts and drawings in them. Each one appears in the **Clippings** tray at the bottom right of the page. Drag a clipping into your notes, or press **Place** to put it under its section.

Photos are often blurry or skewed, so the AI can also **redraw** a diagram cleanly. A clean diagram is a drawing plus separate labels: double-click a label to edit it, drag labels and their pointer dots to move them, and use **＋ Label** to add your own. The first two diagrams are redrawn automatically; press **Redraw** on any other clipping. Each redraw uses one AI request.

Clean diagrams are simplified schematics drawn by the AI, so check them against the original, especially labels and arrows. To cut out part of a photo yourself, click the photo and choose **Clip a picture**, then drag a box around what you want.

### How do I change the font?

On the **Home** tab, use the font and size boxes. With text selected they change just that text; with nothing selected they change the whole page.

### How do I write with a stylus or pen?

Touch the page with your stylus and Study Hall switches to drawing automatically. Choose pen type, colour and thickness on the **Draw** tab. Flip the stylus over (or hold its button) to erase. While a stylus is in use, fingers scroll instead of drawing.

### Can I make notes from a PDF, Word or PowerPoint file?

Yes. Open a page, go to **Insert → Document** (or drag the file onto the page), then press **Turn into notes**. PDF, Word (.docx), PowerPoint (.pptx), text, Markdown and CSV files work.

PowerPoint speaker notes and pictures are read too. With Gemini or Claude, PDFs are read as they are, including their pictures. With Ollama, the first 20 pages of a PDF are read as images.

> Each document uses one AI request. Very long documents (hundreds of pages) work best split into chapters.

### How do I record a lecture or a voice note?

1. Open a page and go to **Insert → Record**.
2. Allow the microphone the first time. Keep the device near the speaker; the meter shows it can hear.
3. Press **Stop and save**. The recording appears on the page with a player.
4. Press **Turn into notes**. The recording is written out (you can read the **Transcript**), then turned into organized notes.

Already have a recording? Use **Insert → Audio file** (MP3, M4A, WAV, AAC, OGG, WebM or FLAC).

> Writing out speech uses Google Gemini, even if you picked another AI, so add a free Gemini key in AI setup. Each 8 minutes of audio is one request, so a 1-hour lecture uses about 8.

### Can I dictate notes instead of typing?

Yes. Click where the words should go, then **Home → Dictate**. Speak, and press **Stop dictating** when you're done.

On iPad and in a browser, words appear as you speak. In the Windows, Mac and Android apps, what you said is written out by Gemini when you stop (one request per 8 minutes).

### How do I ask the AI to explain part of my notes?

Highlight any text in your notes. A purple **✨ Ask** button appears beside it. Click it to open the chat on the right.

1. Pick a quick question (**Explain in more detail**, **How do I derive this?**, **Give me an example**, **Quiz me on this**…) or type your own.
2. Keep asking follow-up questions in the same chat.
3. Press **Insert into notes** to keep an answer. It's added under the highlighted part and marked as an AI answer.

To ask about a diagram, drawing or handwriting, click the picture and press **✨ Ask**, or use **Home → Ask about an area** and drag a box around it. **Ctrl+J** (⌘J on Mac) asks about the highlighted text.

Every answer is **checked against Wikipedia** and says whether it agrees, differs (and how), or isn't covered, with links to the articles. To check something yourself, press **🔎 Look it up** for Google, Wikipedia, YouTube or Khan Academy.

> Each question uses one AI request (Wikipedia checks are free). Answers can still be wrong: they say when they go beyond your notes.

### Can the AI search the web to check its answers?

Yes, if your AI key allows it. Open **AI setup** and turn on **Check Ask AI answers with a web search**. Ask AI answers then come from a web search with the sources listed, instead of Wikipedia.

1. **Claude:** works with any key. Anthropic charges a small fee per search on top of the normal cost.
2. **Google Gemini:** needs a paid (billing-enabled) key. Free keys can't search, so Study Hall checks with Wikipedia instead and tells you.
3. **Ollama (local model):** can't search the web; answers are checked with Wikipedia.

Each web-checked question uses one extra AI request. Notes made from your photos, documents and recordings are never mixed with web results: they come only from your class material.

## Flashcards and studying

### How do I import a set from Quizlet?

1. Open the set on quizlet.com and copy its link from the address bar (or click **⋯ → Embed** and copy the HTML).
2. In Study Hall, go to **Study → Flashcards → Import from Quizlet**.
3. Paste the link and click **Import**, then **Create**.

Only public sets can be imported. If a Quizlet window opens asking you to verify, complete it and the import continues.

### How do I export a set to Quizlet?

1. Open the set (from **Study tools** or **All flashcard sets**) and click **Export to Quizlet**.
2. Click **Copy & open Quizlet**. Quizlet's "Create a new set" page opens in your browser.
3. Click **Import** on Quizlet, paste, and check the separators match the ones Study Hall shows.

Images on cards don't carry over through Quizlet's text import; add them in Quizlet afterwards.

### Why does Practice test ask me to make flashcards?

Tests are built from a class's flashcards. Make a set first (**Study → Flashcards**), then **Practice test** quizzes you on it with multiple choice, true/false and written questions.

### How do I make a study guide for an exam?

Add your notes for the class first. Then go to **Study → Study guide**, choose what to cover (the whole class, a section or one page), and optionally describe the exam. The guide is saved as a page under **Study guides**, where you can edit and draw on it like any other page.

## Sharing and exporting

### How do I share a notebook with classmates?

1. Open the notebook and press **Home → Share** (or click the notebook name → Share).
2. Sign in with your email. You get a 6-digit code by email; there's no password, and the account is free.
3. Type a classmate's email, choose **Can edit** or **Can view**, and press **Invite**. Copy the message Study Hall gives you and send it to them.
4. They sign in to Study Hall with that email and open **👤 → Shared with me → Add**.

Changes sync automatically while you're online and appear live on pages others have open. If two people change the same page at the same moment, the later save wins.

> Only people you invite can open a shared notebook. Notebooks you don't share never leave your device.

Each person can share up to **100 MB** of photos and documents (the Share window shows how much you've used). Recordings stay on your device; their transcripts and the notes made from them are shared. When your space is full, new photos and documents aren't shared, but your notes keep syncing. Stop sharing notebooks you no longer need to free space.

### Can someone see my notes without installing the app?

Yes. In the Share window, tick **Anyone with the link can view** and press **Copy link**. The link opens a read-only web page; no account is needed. Untick it any time and the link stops working.

### Why can't I edit a notebook someone shared with me?

They shared it as **Can view**. You can read it, study it, make flashcards from it, ask the AI about it and export it, but not change it. Ask the owner to switch you to **Can edit**.

### How do I stop sharing, or leave a shared notebook?

Open **Share** and press **Stop sharing** (if it's yours) or **Leave notebook**. Stopping deletes the online copy and turns off the link; your own copy stays on your device. To remove one person, press ✕ next to their name.

### How do I get my notes into Word, Google Docs, PowerPoint, Notion, Evernote or Obsidian?

Press **Home → Export** (or click ⋯ next to a page, or the notebook name → Export). Choose **This page** or the **Whole notebook**, then the app:

1. **Word**: saves a .docx file.
2. **Google Docs**: saves a .docx. Upload it to Google Drive, right-click it, then **Open with → Google Docs**.
3. **PowerPoint**: a .pptx with a slide per heading, pictures on their own slides, and Q&A answers in the speaker notes.
4. **Google Slides**: saves a .pptx. Upload it to Google Drive, then **Open with → Google Slides**.
5. **Notion**: saves a Word file. In Notion, click **Import → Word**; Notion keeps headings, lists and pictures this way.
6. **Evernote**: saves an .enex file. In the Evernote desktop app, **File → Import → Evernote export file**. Each page becomes a note.
7. **Obsidian**: on a computer, pick your vault folder and the notes are written into a **Study Hall** folder there, with pictures in **attachments**. On a tablet you get a .zip to unzip into the vault.

> Exports include text, highlights, formulas, tables, Q&A, pictures and diagrams. Pen ink is only kept in the PDF (Home → Save as PDF / Print).

## Installing and your data

### Windows says "Windows protected your PC" when I install.

This appears for apps that aren't signed with a paid certificate. Click **More info**, then **Run anyway**. You only see it once.

### Where is my work saved?

On your device. On Windows that's **%APPDATA%\Study Hall**; on a Mac, **~/Library/Application Support/Study Hall**; on iPad and Android, inside the app. Nothing is uploaded except what you send to the AI, and notebooks you choose to share.

### How do I back up to iCloud Drive?

**On a Mac or Windows PC:** go to **Help → Backup** and press **Back up to iCloud Drive** (on Windows, install **iCloud for Windows** first). Study Hall then saves a backup of everything there once a day and keeps the last 7. Any folder works, including OneDrive, Google Drive or Dropbox.

**On iPad or Android:** apps can't write into iCloud Drive in the background, so press **Help → Backup → Back up now** and choose **Save to Files → iCloud Drive** (or Google Drive). Study Hall reminds you weekly.

**To restore** (or move to another device): **Help → Backup → Import a file**, and pick a backup. Nothing already on the device is overwritten.

### How do I install Study Hall on a Mac, iPad or Samsung/Android tablet?

All versions are free and listed on the [download page](https://github.com/iNemesisX/Study-Hall/releases/latest).

1. **Mac:** download **StudyHall-macOS.dmg**, open it and drag Study Hall to Applications. If the Mac says it can't check the app (it isn't signed with a paid Apple certificate), open **System Settings → Privacy & Security**, scroll down and click **Open Anyway**.
2. **iPad:** open the web version link from the download page in **Safari**, tap **Share → Add to Home Screen**. It then works like an app, offline too, and Apple Pencil works for drawing.
3. **Samsung / Android tablet:** download **StudyHall-Android.apk** on the tablet and open it. Allow installing from this source when asked. The S Pen draws with pressure; hold its side button to erase.

To move your work across, see **How do I back up to iCloud Drive?** (Export everything, then Import a file on the new device).

### How do I update Study Hall?

Updates arrive by themselves; you don't need to download anything new. When one is ready, a card at the bottom right says so. **Help → Check for updates** looks straight away.

1. **Windows:** the update downloads in the background. Press **Restart now** (or just close Study Hall later) and it installs and reopens.
2. **iPad and browser:** the new version loads in the background; press **Reload**.
3. **Android:** most updates download and apply on restart. Rarely, an update needs the new app file; the card then links to it.
4. **Mac:** the card links to the new version. Open it and drag Study Hall into Applications to replace the old one.

Your notebooks, flashcards and settings are always kept.

### If I uninstall or update, do I lose my notes?

No. Uninstalling removes the program only; your notebooks and flashcard sets stay in %APPDATA%\Study Hall and reappear when you reinstall. To update, just run the new installer.

### I used StudyDeck before. Where are my sets?

Study Hall copies your StudyDeck sets and notebooks across the first time it starts. Find them under **All flashcard sets** and in the notebook list. Your StudyDeck folder is left untouched.

### How do I see the tour again?

Go to **Help → Take the tour**. **Help → Feature guide** lists every feature and where to find it.

