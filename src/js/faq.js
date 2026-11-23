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
        ],
      },
      {
        id: 'which-ai', q: 'Which AI option should I choose?',
        a: [
          'Start with **Google Gemini**: it is free and good enough for most slides and printed pages.',
          'Switch to **Claude** if your notes are mostly messy handwriting or dense diagrams and Gemini keeps missing things. Use **Ollama** if you want nothing to leave your computer and your PC is powerful enough.',
          'You can switch at any time in AI setup. Notes you already made are kept.',
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
          'To use less: turn photos into notes a handful at a time rather than one by one, or switch to Ollama or Claude in AI setup.',
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
    group: 'Installing and your data',
    items: [
      {
        id: 'smartscreen', q: 'Windows says "Windows protected your PC" when I install.',
        a: [
          'This appears for apps that aren\'t signed with a paid certificate. Click **More info**, then **Run anyway**. You only see it once.',
        ],
      },
      {
        id: 'data', q: 'Where is my work saved, and how do I back it up?',
        a: [
          'Everything is saved automatically on your computer, in **%APPDATA%\\Study Hall**. Nothing is uploaded except the photos and notes you send to the AI when generating.',
          { steps: [
            '**Flashcard sets:** Help → Backup → Export backup creates a single file you can restore later.',
            '**Notebooks** (pages, photos and ink) are in the **notebooks** folder inside %APPDATA%\\Study Hall. Copy that folder to back them up or move them to another PC.',
          ] },
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
