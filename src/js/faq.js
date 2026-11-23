// Frequently asked questions. Shown in the app (Help → FAQ) and turned into
// docs/FAQ.md by `npm run docs`, so there is one source for both.
//
// Each answer is a list of blocks: a string is a paragraph, { steps: [...] } is a
// numbered list, { tip: '...' } is a highlighted note. Inside text, **bold** and
// [link text](https://...) are supported. `action` adds a button in the app.

export const FAQ = [
  {
    group: 'AI and API keys',
    items: [
      {
        id: 'free', q: 'Does Study Hall cost anything to use?',
        a: [
          'No. The app is free, and so are two of its three AI options:',
          { steps: [
            '**Google Gemini** (the default) is free with a Google account. It has daily usage limits that are plenty for normal studying.',
            '**On this computer (Ollama)** is free and works offline, but needs a powerful PC.',
            '**Anthropic Claude** is paid per use and gives the most accurate notes.',
          ] },
          'You only need an AI for writing notes from photos, generating flashcards and writing study guides. Typing notes, drawing, studying flashcards and taking tests work without one.',
        ],
      },
      {
        id: 'api-key', q: 'What is an API key?',
        a: [
          'An API key is a long password that lets Study Hall use an AI service on your behalf. Each person gets their own key from the AI company and pastes it into Study Hall once.',
          { tip: 'Treat it like a password: don\'t post it online or share it. If it leaks, delete it on the provider\'s website and create a new one.' },
        ],
      },
      {
        id: 'gemini', q: 'How do I get a free Gemini API key and connect it?',
        action: 'ai',
        a: [
          { steps: [
            'Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and sign in with a Google account. If you\'re asked to accept the terms, accept them.',
            'Click **Create API key**. If it asks for a project, pick the default one or let it create a new one.',
            'Click **Copy** next to the new key.',
            'In Study Hall, click the **AI** button at the top right (or **Help → AI setup**).',
            'Choose **Google Gemini**, paste the key into **API key**, and click **Test connection**.',
            'When it says **Connected**, click **Save**.',
          ] },
          'Free keys have daily limits that reset at midnight Pacific time. On the free tier, Google may use what you send to improve its products, so don\'t photograph anything private.',
          { tip: 'School Google accounts sometimes block AI Studio. If yours does, use a personal Google account.' },
        ],
      },
      {
        id: 'claude', q: 'How do I get a Claude API key and connect it?',
        action: 'ai',
        a: [
          { steps: [
            'Go to [console.anthropic.com](https://console.anthropic.com) and create an account or sign in.',
            'Open **Billing** and add credit. Claude is paid per use; a few dollars lasts a long time for notes.',
            'Open **API keys** and click **Create key**. Give it a name like "Study Hall".',
            'Copy the key straight away. It is shown only once.',
            'In Study Hall, click the **AI** button at the top right, choose **Anthropic Claude**, paste the key and click **Test connection**.',
            'When it says **Connected**, click **Save**.',
          ] },
          'You can set a monthly spending limit in the Anthropic console so you are never charged more than you expect.',
        ],
      },
      {
        id: 'ollama', q: 'How do I run the AI on my own computer (Ollama)?',
        action: 'ai',
        a: [
          'This is free, private and works without internet, but it needs a strong PC: ideally a graphics card with about 8 GB of memory or more. It is slower than the online options and less accurate on handwriting.',
          { steps: [
            'Download and install Ollama from [ollama.com/download](https://ollama.com/download).',
            'Open **Command Prompt** (or Terminal) and run **ollama pull qwen3-vl:8b**. This downloads the model, which is several gigabytes.',
            'Make sure Ollama is running (it starts automatically after install and shows an icon in the system tray).',
            'In Study Hall, click the **AI** button at the top right and choose **On this computer (Ollama)**.',
            'Leave the address as **http://localhost:11434** and click **Test connection**, then **Save**.',
          ] },
          'Any Ollama model that can read images works. Click **Find models** in AI setup to pick from the ones you have downloaded.',
          'The local model does almost everything: notes from photos and documents, **Ask AI** (including pictures and boxed areas), flashcards, tests and study guides, with no daily limit and nothing leaving your computer. Answers are slower than Gemini or Claude on most PCs.',
          { tip: '**Recordings and dictation still need a free Gemini key**, because local models can\'t listen to audio. Once a recording is written out, the notes from it are made by your local model. PDFs are read as page images (first 20 pages).' },
          '**On an Android tablet**, run Ollama on a computer on the same Wi-Fi and enter that computer\'s address in AI setup (for example **http://192.168.1.10:11434**). On the PC, set the environment variable **OLLAMA_HOST=0.0.0.0** and restart Ollama so other devices can reach it. The iPad and browser versions can\'t use Ollama.',
        ],
      },
      {
        id: 'which-ai', q: 'Which AI option should I choose?',
        a: [
          'Start with **Google Gemini**: it is free and good enough for most slides and printed pages.',
          'Switch to **Claude** if your notes are mostly messy handwriting or dense diagrams and Gemini keeps missing things. Use **Ollama** (a local model on your own computer) if you want nothing to leave your computer and no daily limit, and your PC is powerful enough. It runs Ask AI too, but recordings and dictation still use Gemini.',
          'You can switch at any time in AI setup. Notes you already made are kept.',
        ],
      },
      {
        id: 'ai-wrong', q: 'Can AI-generated notes, flashcards or study guides be wrong?',
        a: [
          'Yes. AI models can misread a photo, mix up details or state something that sounds right but isn\'t. Everything the AI writes in Study Hall is marked in the app with a ✨ notice naming the AI service and model that wrote it, for example "Notes on this page were written with Google Gemini (gemini-3.5-flash)". The notice is left out of PDF exports.',
          { steps: [
            'Check notes against the original slides or textbook, especially numbers, formulas, names and dates. The photos stay on the page so you can compare.',
            'Fix mistakes directly: click and type. Your edits are used for flashcards and study guides made afterwards.',
            'Redrawn diagrams are simplified schematics marked "AI-drawn". Compare their labels and arrows with the original photo.',
            'If a page has many mistakes, try **Exhaustive** detail or a more accurate AI option in AI setup, then **Insert → Rewrite all**.',
          ] },
          { tip: 'Treat AI notes as a first draft to study from, not as the final word. When the AI and your teacher disagree, go with your teacher.' },
        ],
      },
      {
        id: 'key-safe', q: 'Where is my API key stored? Is it safe?',
        a: [
          'Your key is saved only on your computer, encrypted with your Windows account. Study Hall sends it only to the company that issued it (Google or Anthropic), and only when you generate something.',
          'To remove it, open AI setup and click **Remove key**. You can also delete the key on the provider\'s website, which stops it working everywhere.',
        ],
      },
      {
        id: 'key-rejected', q: 'It says "The API key was rejected" or "Model not found".',
        action: 'ai',
        a: [
          { steps: [
            'Open AI setup and paste the key again. Make sure you copied the whole key with no spaces.',
            'Check the key still exists on the provider\'s website (Google AI Studio or the Anthropic console).',
            'For "Model not found", click **Find models** and pick one from the list. AI companies retire old model names from time to time.',
            'Click **Test connection** to confirm, then **Save**.',
          ] },
        ],
      },
      {
        id: 'limit', q: 'It says "The free Gemini limit was reached".',
        a: [
          'The free tier allows a limited number of requests per minute and per day. Wait a minute and try again. If it keeps happening, you have used the day\'s allowance; it resets at midnight Pacific time.',
          'To use less: turn photos into notes a handful at a time rather than one by one, turn off **Draw clean versions of diagrams** in AI setup, or switch to another model, Ollama or Claude.',
        ],
      },
      {
        id: 'usage', q: 'How do I know when I\'m close to my AI limit?',
        a: [
          'The **AI** button at the top right shows how many requests you have used today, for example "12/20 today". It turns yellow when you pass three quarters of the limit, and a warning bar appears under the toolbar with how many requests are left and when the limit resets. A second warning appears at 90%, and a red one when the limit is used up.',
          'Before an action that needs several requests, Study Hall also checks what is left and asks before continuing if it might not be enough.',
          'Google does not tell apps how much of the free allowance is left, so Study Hall counts its own requests. It starts from an estimate of 20 a day for free Gemini Flash models and corrects it from Google\'s own message the first time a limit is reached. Your real limits are listed at [aistudio.google.com/rate-limit](https://aistudio.google.com/rate-limit); you can type the number into **AI setup → Daily request limit** to make the warning exact. For Claude, set a daily budget in AI setup to get the same warnings.',
          { tip: 'Requests made with the same key in other apps are not counted, and limits are per model, so switching model in AI setup gives you that model\'s separate allowance.' },
        ],
      },
    ],
  },
  {
    group: 'Photos and notes',
    items: [
      {
        id: 'phone', q: 'The phone camera QR code doesn\'t connect.',
        a: [
          { steps: [
            'Make sure the phone and the computer are on the **same Wi-Fi network** (not mobile data).',
            'If Windows asked whether to allow Study Hall on networks, choose **Private networks** and allow it.',
            'If the dialog shows a "Not connecting? Try another network" list, pick a different entry and scan again.',
            'Keep the QR window open on the computer while taking photos. Closing it ends the session.',
          ] },
          'School, work and public Wi-Fi often block devices from reaching each other. On those networks, take the photos normally and transfer them, or use **Insert → Photos**.',
        ],
      },
      {
        id: 'heic', q: 'My iPhone photos won\'t add.',
        a: [
          'iPhones save photos as HEIC, which Windows can\'t always read. Either use **Insert → Phone camera** (it converts photos automatically), or on the iPhone go to **Settings → Camera → Formats** and choose **Most Compatible** so new photos are saved as JPEG.',
        ],
      },
      {
        id: 'bad-notes', q: 'The notes missed something or got it wrong.',
        a: [
          'You can edit anything on the page: click and type. To get better notes next time:',
          { steps: [
            'Take photos straight on, in good light, with the whole slide or page in frame.',
            'In AI setup, set **Note detail** to **Exhaustive**.',
            'Use **Insert → Rewrite all** to write the page again from its photos.',
            'For handwriting, Claude is the most accurate option.',
          ] },
        ],
      },
      {
        id: 'pictures', q: 'How do I add a picture or diagram to my notes?',
        a: [
          { steps: [
            'Go to **Insert → Picture** and choose an image. Or drag an image onto your notes (or paste one) and choose **Place in my notes as a picture**.',
            'Click the picture to select it. Drag it to move it; drag the round handle at its corner to resize it.',
            'To write on it, click **Draw on it** (or open the Draw tab) and draw. The ink stays attached when you move the picture.',
            'Press **Delete**, or the bin button above the picture, to remove it.',
          ] },
        ],
      },
      {
        id: 'clippings', q: 'What are Clippings and clean diagrams?',
        a: [
          'When you turn photos into notes, the AI also looks for diagrams, charts and drawings in them. Each one appears in the **Clippings** tray at the bottom right of the page. Drag a clipping into your notes, or press **Place** to put it under its section.',
          'Photos are often blurry or skewed, so the AI can also **redraw** a diagram cleanly. A clean diagram is a drawing plus separate labels: double-click a label to edit it, drag labels and their pointer dots to move them, and use **＋ Label** to add your own. The first two diagrams are redrawn automatically; press **Redraw** on any other clipping. Each redraw uses one AI request.',
          'Clean diagrams are simplified schematics drawn by the AI, so check them against the original, especially labels and arrows. To cut out part of a photo yourself, click the photo and choose **Clip a picture**, then drag a box around what you want.',
        ],
      },
      {
        id: 'fonts', q: 'How do I change the font?',
        a: [
          'On the **Home** tab, use the font and size boxes. With text selected they change just that text; with nothing selected they change the whole page.',
        ],
      },
      {
        id: 'stylus', q: 'How do I write with a stylus or pen?',
        a: [
          'Touch the page with your stylus and Study Hall switches to drawing automatically. Choose pen type, colour and thickness on the **Draw** tab. Flip the stylus over (or hold its button) to erase. While a stylus is in use, fingers scroll instead of drawing.',
        ],
      },
      {
        id: 'documents', q: 'Can I make notes from a PDF, Word or PowerPoint file?',
        a: [
          'Yes. Open a page, go to **Insert → Document** (or drag the file onto the page), then press **Turn into notes**. PDF, Word (.docx), PowerPoint (.pptx), text, Markdown and CSV files work.',
          'PowerPoint speaker notes and pictures are read too. With Gemini or Claude, PDFs are read as they are, including their pictures. With Ollama, the first 20 pages of a PDF are read as images.',
          { tip: 'Each document uses one AI request. Very long documents (hundreds of pages) work best split into chapters.' },
        ],
      },
      {
        id: 'record', q: 'How do I record a lecture or a voice note?',
        a: [
          { steps: [
            'Open a page and go to **Insert → Record**.',
            'Allow the microphone the first time. Keep the device near the speaker; the meter shows it can hear.',
            'Press **Stop and save**. The recording appears on the page with a player.',
            'Press **Turn into notes**. The recording is written out (you can read the **Transcript**), then turned into organized notes.',
          ] },
          'Already have a recording? Use **Insert → Audio file** (MP3, M4A, WAV, AAC, OGG, WebM or FLAC).',
          { tip: 'Writing out speech uses Google Gemini, even if you picked another AI, so add a free Gemini key in AI setup. Each 8 minutes of audio is one request, so a 1-hour lecture uses about 8.' },
        ],
      },
      {
        id: 'dictate', q: 'Can I dictate notes instead of typing?',
        a: [
          'Yes. Click where the words should go, then **Home → Dictate**. Speak, and press **Stop dictating** when you\'re done.',
          'On iPad and in a browser, words appear as you speak. In the Windows, Mac and Android apps, what you said is written out by Gemini when you stop (one request per 8 minutes).',
        ],
      },
      {
        id: 'ask', q: 'How do I ask the AI to explain part of my notes?',
        a: [
          'Highlight any text in your notes. A purple **✨ Ask** button appears beside it. Click it to open the chat on the right.',
          { steps: [
            'Pick a quick question (**Explain in more detail**, **How do I derive this?**, **Give me an example**, **Quiz me on this**…) or type your own.',
            'Keep asking follow-up questions in the same chat.',
            'Press **Insert into notes** to keep an answer. It\'s added under the highlighted part and marked as an AI answer.',
          ] },
          'To ask about a diagram, drawing or handwriting, click the picture and press **✨ Ask**, or use **Home → Ask about an area** and drag a box around it. **Ctrl+J** (⌘J on Mac) asks about the highlighted text.',
          'Every answer is **checked against Wikipedia** and says whether it agrees, differs (and how), or isn\'t covered, with links to the articles. To check something yourself, press **🔎 Look it up** for Google, Wikipedia, YouTube or Khan Academy.',
          { tip: 'Each question uses one AI request (Wikipedia checks are free). Answers can still be wrong: they say when they go beyond your notes.' },
        ],
      },
      {
        id: 'web-search', q: 'Can the AI search the web to check its answers?',
        a: [
          'Yes, if your AI key allows it. Open **AI setup** and turn on **Check Ask AI answers with a web search**. Ask AI answers then come from a web search with the sources listed, instead of Wikipedia.',
          { steps: [
            '**Claude:** works with any key. Anthropic charges a small fee per search on top of the normal cost.',
            '**Google Gemini:** needs a paid (billing-enabled) key. Free keys can\'t search, so Study Hall checks with Wikipedia instead and tells you.',
            '**Ollama (local model):** can\'t search the web; answers are checked with Wikipedia.',
          ] },
          'Each web-checked question uses one extra AI request. Notes made from your photos, documents and recordings are never mixed with web results: they come only from your class material.',
        ],
      },
    ],
  },
  {
    group: 'Flashcards and studying',
    items: [
      {
        id: 'quizlet-import', q: 'How do I import a set from Quizlet?',
        a: [
          { steps: [
            'Open the set on quizlet.com and copy its link from the address bar (or click **⋯ → Embed** and copy the HTML).',
            'In Study Hall, go to **Study → Flashcards → Import from Quizlet**.',
            'Paste the link and click **Import**, then **Create**.',
          ] },
          'Only public sets can be imported. If a Quizlet window opens asking you to verify, complete it and the import continues.',
        ],
      },
      {
        id: 'quizlet-export', q: 'How do I export a set to Quizlet?',
        a: [
          { steps: [
            'Open the set (from **Study tools** or **All flashcard sets**) and click **Export to Quizlet**.',
            'Click **Copy & open Quizlet**. Quizlet\'s "Create a new set" page opens in your browser.',
            'Click **Import** on Quizlet, paste, and check the separators match the ones Study Hall shows.',
          ] },
          'Images on cards don\'t carry over through Quizlet\'s text import; add them in Quizlet afterwards.',
        ],
      },
      {
        id: 'test-needs-cards', q: 'Why does Practice test ask me to make flashcards?',
        a: [
          'Tests are built from a class\'s flashcards. Make a set first (**Study → Flashcards**), then **Practice test** quizzes you on it with multiple choice, true/false and written questions.',
        ],
      },
      {
        id: 'guide', q: 'How do I make a study guide for an exam?',
        a: [
          'Add your notes for the class first. Then go to **Study → Study guide**, choose what to cover (the whole class, a section or one page), and optionally describe the exam. The guide is saved as a page under **Study guides**, where you can edit and draw on it like any other page.',
        ],
      },
    ],
  },
  {
    group: 'Sharing and exporting',
    items: [
      {
        id: 'share', q: 'How do I share a notebook with classmates?',
        a: [
          { steps: [
            'Open the notebook and press **Home → Share** (or click the notebook name → Share).',
            'Sign in with your email. You get a 6-digit code by email; there\'s no password, and the account is free.',
            'Type a classmate\'s email, choose **Can edit** or **Can view**, and press **Invite**. Copy the message Study Hall gives you and send it to them.',
            'They sign in to Study Hall with that email and open **👤 → Shared with me → Add**.',
          ] },
          'Changes sync automatically while you\'re online and appear live on pages others have open. If two people change the same page at the same moment, the later save wins.',
          { tip: 'Only people you invite can open a shared notebook. Notebooks you don\'t share never leave your device.' },
          'Each person can share up to **100 MB** of photos and documents (the Share window shows how much you\'ve used). Recordings stay on your device; their transcripts and the notes made from them are shared. When your space is full, new photos and documents aren\'t shared, but your notes keep syncing. Stop sharing notebooks you no longer need to free space.',
        ],
      },
      {
        id: 'view-link', q: 'Can someone see my notes without installing the app?',
        a: [
          'Yes. In the Share window, tick **Anyone with the link can view** and press **Copy link**. The link opens a read-only web page; no account is needed. Untick it any time and the link stops working.',
        ],
      },
      {
        id: 'view-only', q: 'Why can\'t I edit a notebook someone shared with me?',
        a: [
          'They shared it as **Can view**. You can read it, study it, make flashcards from it, ask the AI about it and export it, but not change it. Ask the owner to switch you to **Can edit**.',
        ],
      },
      {
        id: 'stop-sharing', q: 'How do I stop sharing, or leave a shared notebook?',
        a: [
          'Open **Share** and press **Stop sharing** (if it\'s yours) or **Leave notebook**. Stopping deletes the online copy and turns off the link; your own copy stays on your device. To remove one person, press ✕ next to their name.',
        ],
      },
      {
        id: 'export', q: 'How do I get my notes into Word, Google Docs, PowerPoint, Notion, Evernote or Obsidian?',
        a: [
          'Press **Home → Export** (or click ⋯ next to a page, or the notebook name → Export). Choose **This page** or the **Whole notebook**, then the app:',
          { steps: [
            '**Word**: saves a .docx file.',
            '**Google Docs**: saves a .docx. Upload it to Google Drive, right-click it, then **Open with → Google Docs**.',
            '**PowerPoint**: a .pptx with a slide per heading, pictures on their own slides, and Q&A answers in the speaker notes.',
            '**Google Slides**: saves a .pptx. Upload it to Google Drive, then **Open with → Google Slides**.',
            '**Notion**: saves a Word file. In Notion, click **Import → Word**; Notion keeps headings, lists and pictures this way.',
            '**Evernote**: saves an .enex file. In the Evernote desktop app, **File → Import → Evernote export file**. Each page becomes a note.',
            '**Obsidian**: on a computer, pick your vault folder and the notes are written into a **Study Hall** folder there, with pictures in **attachments**. On a tablet you get a .zip to unzip into the vault.',
          ] },
          { tip: 'Exports include text, highlights, formulas, tables, Q&A, pictures and diagrams. Pen ink is only kept in the PDF (Home → Save as PDF / Print).' },
        ],
      },
    ],
  },
  {
    group: 'Installing and your data',

    items: [
      {
        id: 'smartscreen', q: 'Windows says "Windows protected your PC" when I install.',
        a: [
          'This appears for apps that aren\'t signed with a paid certificate. Click **More info**, then **Run anyway**. You only see it once.',
        ],
      },
      {
        id: 'data', q: 'Where is my work saved?',
        a: [
          'On your device. On Windows that\'s **%APPDATA%\\Study Hall**; on a Mac, **~/Library/Application Support/Study Hall**; on iPad and Android, inside the app. Nothing is uploaded except what you send to the AI, and notebooks you choose to share.',
        ],
      },
      {
        id: 'icloud', q: 'How do I back up to iCloud Drive?',
        a: [
          '**On a Mac or Windows PC:** go to **Help → Backup** and press **Back up to iCloud Drive** (on Windows, install **iCloud for Windows** first). Study Hall then saves a backup of everything there once a day and keeps the last 7. Any folder works, including OneDrive, Google Drive or Dropbox.',
          '**On iPad or Android:** apps can\'t write into iCloud Drive in the background, so press **Help → Backup → Back up now** and choose **Save to Files → iCloud Drive** (or Google Drive). Study Hall reminds you weekly.',
          '**To restore** (or move to another device): **Help → Backup → Import a file**, and pick a backup. Nothing already on the device is overwritten.',
        ],
      },
      {
        id: 'install-other', q: 'How do I install Study Hall on a Mac, iPad or Samsung/Android tablet?',
        a: [
          'All versions are free and listed on the [download page](https://github.com/iNemesisX/Study-Hall/releases/latest).',
          { steps: [
            '**Mac:** download **StudyHall-macOS.dmg**, open it and drag Study Hall to Applications. If the Mac says it can\'t check the app (it isn\'t signed with a paid Apple certificate), open **System Settings → Privacy & Security**, scroll down and click **Open Anyway**.',
            '**iPad:** open the web version link from the download page in **Safari**, tap **Share → Add to Home Screen**. It then works like an app, offline too, and Apple Pencil works for drawing.',
            '**Samsung / Android tablet:** download **StudyHall-Android.apk** on the tablet and open it. Allow installing from this source when asked. The S Pen draws with pressure; hold its side button to erase.',
          ] },
          'To move your work across, see **How do I back up to iCloud Drive?** (Export everything, then Import a file on the new device).',
        ],
      },
      {
        id: 'updates', q: 'How do I update Study Hall?',
        a: [
          'Updates arrive by themselves; you don\'t need to download anything new. When one is ready, a card at the bottom right says so. **Help → Check for updates** looks straight away.',
          { steps: [
            '**Windows:** the update downloads in the background. Press **Restart now** (or just close Study Hall later) and it installs and reopens.',
            '**iPad and browser:** the new version loads in the background; press **Reload**.',
            '**Android:** most updates download and apply on restart. Rarely, an update needs the new app file; the card then links to it.',
            '**Mac:** the card links to the new version. Open it and drag Study Hall into Applications to replace the old one.',
          ] },
          'Your notebooks, flashcards and settings are always kept.',
        ],
      },
      {
        id: 'uninstall', q: 'If I uninstall or update, do I lose my notes?',
        a: [
          'No. Uninstalling removes the program only; your notebooks and flashcard sets stay in %APPDATA%\\Study Hall and reappear when you reinstall. To update, just run the new installer.',
        ],
      },
      {
        id: 'studydeck', q: 'I used StudyDeck before. Where are my sets?',
        a: [
          'Study Hall copies your StudyDeck sets and notebooks across the first time it starts. Find them under **All flashcard sets** and in the notebook list. Your StudyDeck folder is left untouched.',
        ],
      },
      {
        id: 'tour', q: 'How do I see the tour again?',
        a: ['Go to **Help → Take the tour**. **Help → Feature guide** lists every feature and where to find it.'],
      },
    ],
  },
];

/* ---------- rendering ---------- */
const escHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** One line of FAQ text as HTML (bold and https links only). */
export function faqInline(text) {
  return escHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}
export function faqHtml(a) {
  return a.map(b => (typeof b === 'string' ? `<p>${faqInline(b)}</p>`
    : b.steps ? `<ol>${b.steps.map(s => `<li>${faqInline(s)}</li>`).join('')}</ol>`
      : `<p class="faq-tip">${faqInline(b.tip)}</p>`)).join('');
}
export function faqMarkdown() {
  const out = ['# Study Hall: Frequently asked questions', '', 'This page is generated from `src/js/faq.js`, the same text shown in the app under **Help → FAQ**.', ''];
  for (const g of FAQ) {
    out.push(`## ${g.group}`, '');
    for (const it of g.items) {
      out.push(`### ${it.q}`, '');
      for (const b of it.a) {
        if (typeof b === 'string') out.push(b, '');
        else if (b.steps) { b.steps.forEach((s, i) => out.push(`${i + 1}. ${s}`)); out.push(''); }
        else out.push(`> ${b.tip}`, '');
      }
    }
  }
  return out.join('\n');
}
