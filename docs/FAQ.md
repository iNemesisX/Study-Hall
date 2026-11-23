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

### Which AI option should I choose?

Start with **Google Gemini**: it is free and good enough for most slides and printed pages.

Switch to **Claude** if your notes are mostly messy handwriting or dense diagrams and Gemini keeps missing things. Use **Ollama** if you want nothing to leave your computer and your PC is powerful enough.

You can switch at any time in AI setup. Notes you already made are kept.

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

## Installing and your data

### Windows says "Windows protected your PC" when I install.

This appears for apps that aren't signed with a paid certificate. Click **More info**, then **Run anyway**. You only see it once.

### Where is my work saved, and how do I back it up?

Everything is saved automatically on your computer, in **%APPDATA%\Study Hall**. Nothing is uploaded except the photos and notes you send to the AI when generating.

1. **Flashcard sets:** Help → Backup → Export backup creates a single file you can restore later.
2. **Notebooks** (pages, photos and ink) are in the **notebooks** folder inside %APPDATA%\Study Hall. Copy that folder to back them up or move them to another PC.

### If I uninstall or update, do I lose my notes?

No. Uninstalling removes the program only; your notebooks and flashcard sets stay in %APPDATA%\Study Hall and reappear when you reinstall. To update, just run the new installer.

### I used StudyDeck before. Where are my sets?

Study Hall copies your StudyDeck sets and notebooks across the first time it starts. Find them under **All flashcard sets** and in the notebook list. Your StudyDeck folder is left untouched.

### How do I see the tour again?

Go to **Help → Take the tour**. **Help → Feature guide** lists every feature and where to find it.

