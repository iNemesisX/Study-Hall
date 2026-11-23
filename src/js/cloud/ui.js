// Accounts and sharing screens: sign in, share a notebook, invite people, view-only
// links, and notebooks others have shared with you.
import { $, h, esc, modal, toast, busy, confirmDialog } from '../ui.js';
import * as sync from './sync.js';
import * as nbstore from '../notes/nbstore.js';

const errText = e => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const ROLE = { owner: 'Owner', editor: 'Can edit', viewer: 'Can view' };

function notReady() {
  modal({
    title: 'Sharing isn\'t switched on yet',
    body: '<p>Sharing needs Study Hall\'s online service, which hasn\'t been connected in this version yet. Everything else works without it.</p><p class="muted small">Until then, send a copy instead: Export (Home tab) makes a Word, PowerPoint or PDF file, and Backup › Export everything moves notebooks between devices.</p>',
    actions: [{ label: 'OK', kind: 'primary' }],
  });
}

/** Resolves the signed-in user, asking them to sign in first if needed. */
export async function signIn(reason = 'Sign in to share notebooks and see the ones shared with you.') {
  if (!sync.configured()) { notReady(); return null; }
  await sync.init();
  if (sync.currentUser()) return sync.currentUser();
  return new Promise(resolve => {
    let email = '', done = false;
    const finish = u => { if (!done) { done = true; resolve(u); } };
    modal({
      title: 'Sign in to Study Hall',
      body: `<p>${esc(reason)}</p>
        <div data-step="email"><label class="field"><span>Email</span><input class="input" type="email" autocomplete="email" placeholder="you@school.edu" data-email></label>
          <p class="muted small">We'll email you a 6-digit code. No password needed. A free account is made the first time.</p></div>
        <div data-step="code" hidden><label class="field"><span>Code from the email</span><input class="input" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="123456" data-code></label>
          <p class="muted small" data-sent></p><button class="link-btn" data-back>Use a different email</button></div>
        <p class="ai-status" data-status></p>`,
      actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Send code', kind: 'primary', onClick: el => step(el) }],
      onClose: () => finish(sync.currentUser()),
      onMount: el => {
        $('[data-email]', el).addEventListener('keydown', e => { if (e.key === 'Enter') step(el); });
        $('[data-code]', el).addEventListener('keydown', e => { if (e.key === 'Enter') step(el); });
        $('[data-back]', el).onclick = () => { $('[data-step="email"]', el).hidden = false; $('[data-step="code"]', el).hidden = true; $('.modal footer .btn.primary', el).textContent = 'Send code'; };
      },
    });
    async function step(el) {
      const say = (t, bad) => { const s = $('[data-status]', el); s.textContent = t; s.className = `ai-status ${bad ? 'bad' : ''}`; };
      const btn = $('.modal footer .btn.primary', el);
      try {
        btn.disabled = true;
        if ($('[data-step="code"]', el).hidden) {
          email = $('[data-email]', el).value.trim();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { say('Enter your email address', true); return false; }
          say('Sending…');
          await sync.sendCode(email);
          $('[data-step="email"]', el).hidden = true; $('[data-step="code"]', el).hidden = false;
          $('[data-sent]', el).textContent = `Sent to ${email}. It can take a minute; check spam too.`;
          btn.textContent = 'Sign in';
          say('');
          $('[data-code]', el).focus();
          return false;
        }
        say('Checking…');
        const u = await sync.verifyCode(email, $('[data-code]', el).value);
        toast(`Signed in as ${u.email}`);
        finish(u);
        return true;
      } catch (e) {
        const m = errText(e);
        say(/expired|invalid/i.test(m) ? 'That code didn\'t work. Check it, or send a new one.' : /rate|seconds/i.test(m) ? 'Please wait a minute before asking for another code.' : m, true);
        return false;
      } finally { btn.disabled = false; }
    }
  });
}

/** The person button in the app bar. */
export function accountButton() {
  if (!sync.configured()) return null;
  const u = sync.currentUser();
  return h('button', {
    class: `bar-btn account-btn ${u ? 'in' : ''}`, 'data-tour': 'account', title: u ? `Signed in as ${u.email}` : 'Sign in to share notebooks',
    text: u ? u.email[0].toUpperCase() : '👤',
    onclick: e => accountMenu(e.currentTarget),
  });
}
async function accountMenu(anchor) {
  const { menu } = await import('../ui.js');
  const u = sync.currentUser();
  if (!u) return signIn();
  menu(anchor, [
    { head: u.email },
    { label: 'Shared with me…', icon: '👥', onClick: () => sharedWithMe() },
    'sep',
    { label: 'Sign out', icon: '⎋', onClick: async () => { await sync.signOut(); toast('Signed out. Shared notebooks stay on this device but stop syncing until you sign in.'); } },
  ]);
}

/* ---------- sharing a notebook ---------- */
export async function shareDialog(nb) {
  if (!(await signIn('Sign in to share this notebook. The people you invite sign in with their own email.'))) return;
  if (!sync.isShared(nb)) {
    const ok = await confirmDialog('Share this notebook?', `"${nb.name}" (its pages, photos, documents and recordings) will be copied to Study Hall's online service so the people you invite can open it. Only people you invite, or anyone you give a view-only link, can see it.`, 'Share', 'primary');
    if (!ok) return;
    try { await sync.share(nb, busy); busy(null); } catch (e) { busy(null); return toast(`Sharing failed: ${errText(e)}`); }
  }
  manage(nb);
}

async function manage(nb) {
  const owner = nb.cloud.role === 'owner';
  let people = [], link = { on: false, url: null };
  try { [people, link] = await Promise.all([sync.members(nb), owner ? sync.linkState(nb) : Promise.resolve(link)]); } catch (e) { return toast(errText(e)); }
  const close = modal({
    title: `Share "${nb.name}"`,
    wide: true,
    body: `
      ${owner ? `<h3>Invite people</h3>
      <p class="muted small">Invite people who use Study Hall. They sign in with that email and the notebook appears under 👤 › Shared with me.</p>
      <div class="row gap wrap share-invite"><input class="input" type="email" placeholder="classmate@school.edu" data-email>
        <select class="input" data-role><option value="editor">Can edit</option><option value="viewer">Can view</option></select>
        <button class="btn primary" data-invite>Invite</button></div>` : `<p>Shared with you by <b>${esc(nb.cloud.owner || 'the owner')}</b>. You ${nb.cloud.role === 'editor' ? 'can edit' : 'can view'} this notebook.</p>`}
      <h3 style="margin-top:16px">People with access</h3>
      <div class="share-people" data-people></div>
      ${owner ? `<h3 style="margin-top:16px">View-only link</h3>
      <p class="muted small">Anyone with the link can read the notes in a web browser, without the app or an account. They can't change anything.</p>
      <label class="row gap"><input type="checkbox" data-link ${link.on ? 'checked' : ''}><span>Anyone with the link can view</span></label>
      <div class="row gap wrap" data-linkrow ${link.on ? '' : 'hidden'}><input class="input share-link" readonly data-url value="${esc(link.url || '')}"><button class="btn" data-copy>Copy link</button></div>` : ''}
      <p class="muted small" style="margin-top:14px">Changes sync automatically while you're online. If two people change the same page at once, the later save wins. Recordings stay on the device that made them; their transcripts and the notes from them are shared.</p>
      <div class="share-usage" data-usage></div>`,
    actions: [{ label: owner ? 'Stop sharing' : 'Leave notebook', kind: 'ghost', onClick: () => { stopSharing(nb); } }, { label: 'Done', kind: 'primary' }],
    onMount: el => {
      sync.storageUse().then(u => {
        if (!u || !u.quota) return;
        const mb = n => (n / 1048576).toFixed(n < 10485760 ? 1 : 0);
        const pct = Math.min(100, Math.round((u.used / u.quota) * 100));
        $('[data-usage]', el).replaceChildren(
          h('div', { class: 'row gap', style: 'justify-content:space-between' }, h('span', { class: 'small', text: 'Your shared photos and documents' }), h('span', { class: 'small muted', text: `${mb(u.used)} MB of ${mb(u.quota)} MB` })),
          h('div', { class: `usage-meter ${pct >= 90 ? 'full' : pct >= 75 ? 'high' : ''}` }, h('i', { style: `width:${pct}%` })),
          pct >= 90 ? h('p', { class: 'muted small', text: 'Almost full. New photos and documents won\'t be shared once it\'s full (notes still sync). Stop sharing notebooks you no longer need to free space.' }) : null);
      });
      const drawPeople = () => {
        $('[data-people]', el).replaceChildren(
          h('div', { class: 'share-person' }, h('span', { class: 'share-avatar', text: (nb.cloud.owner || '?')[0].toUpperCase() }), h('span', { class: 'grow', text: nb.cloud.owner || '' }), h('span', { class: 'muted small', text: 'Owner' })),
          ...people.map(p => h('div', { class: 'share-person' },
            h('span', { class: 'share-avatar', text: p.email[0].toUpperCase() }), h('span', { class: 'grow', text: p.email }),
            owner ? h('select', { class: 'input small', onchange: async e => { try { await sync.invite(nb, p.email, e.target.value); p.role = e.target.value; toast('Updated'); } catch (err) { toast(errText(err)); } } },
              ['editor', 'viewer'].map(r => h('option', { value: r, text: ROLE[r], selected: p.role === r }))) : h('span', { class: 'muted small', text: ROLE[p.role] }),
            owner ? h('button', { class: 'icon-btn', title: 'Remove access', text: '✕', onclick: async () => { try { await sync.removeMember(nb, p.email); people = people.filter(x => x !== p); drawPeople(); } catch (err) { toast(errText(err)); } } }) : null)));
      };
      drawPeople();
      if (!owner) return;
      const invite = async () => {
        const email = $('[data-email]', el).value;
        try {
          await sync.invite(nb, email, $('[data-role]', el).value);
          people = await sync.members(nb); drawPeople();
          $('[data-email]', el).value = '';
          inviteMessage(nb, email.trim().toLowerCase());
        } catch (err) { toast(errText(err)); }
      };
      $('[data-invite]', el).onclick = invite;
      $('[data-email]', el).addEventListener('keydown', e => { if (e.key === 'Enter') invite(); });
      $('[data-link]', el).onchange = async e => {
        try {
          const url = await sync.setLink(nb, e.target.checked);
          $('[data-linkrow]', el).hidden = !e.target.checked;
          if (url) $('[data-url]', el).value = url;
          toast(e.target.checked ? 'View-only link is on' : 'View-only link is off. The old link stops working.');
        } catch (err) { e.target.checked = !e.target.checked; toast(errText(err)); }
      };
      $('[data-copy]', el).onclick = async () => { try { await navigator.clipboard.writeText($('[data-url]', el).value); toast('Link copied'); } catch { $('[data-url]', el).select(); } };
    },
  });
  return close;
}

// Study Hall doesn't send emails itself: give the owner a message to send.
function inviteMessage(nb, email) {
  const text = `I shared my Study Hall notebook "${nb.name}" with you.\n\n1. Get Study Hall (free): https://github.com/iNemesisX/Study-Hall/releases/latest\n2. Click 👤 (top right) and sign in with ${email}\n3. Open 👤 › Shared with me and add "${nb.name}".`;
  modal({
    title: 'Invited',
    body: `<p>${esc(email)} can now open "${esc(nb.name)}". Send them this so they know:</p><textarea class="input" rows="6" readonly>${esc(text)}</textarea>`,
    actions: [{ label: 'Copy message', kind: 'primary', onClick: async () => { try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Copy failed'); } } }],
  });
}

async function stopSharing(nb) {
  const owner = nb.cloud.role === 'owner';
  const ok = await confirmDialog(owner ? 'Stop sharing?' : 'Leave this notebook?',
    owner ? 'The online copy is deleted and the view-only link stops working. Your notebook stays on this device, and people you shared with keep the copy they already have, which stops syncing.'
      : 'It stops syncing. The copy on this device is kept, so delete it yourself if you don\'t want it.', owner ? 'Stop sharing' : 'Leave');
  if (!ok) return;
  try { await sync.unshare(nb); toast(owner ? 'Sharing stopped' : 'You left the notebook'); } catch (e) { toast(errText(e)); }
}

/* ---------- notebooks shared with me ---------- */
export async function sharedWithMe() {
  if (!(await signIn())) return;
  let rows;
  try { busy('Checking…'); rows = (await sync.listShared()).filter(r => r.role !== 'owner'); busy(null); } catch (e) { busy(null); return toast(errText(e)); }
  modal({
    title: 'Shared with me',
    body: rows.length ? '<div class="share-list" data-list></div>' : `<p>Nothing has been shared with ${esc(sync.currentUser().email)} yet.</p><p class="muted small">Ask the owner to invite this email address from their notebook's Share button.</p>`,
    actions: [{ label: 'Close', kind: 'primary' }],
    onMount: (el, close) => {
      const list = $('[data-list]', el);
      if (!list) return;
      list.replaceChildren(...rows.map(r => h('div', { class: 'share-person' },
        h('i', { class: 'nbchip', style: `background:${r.color || '#5a45c2'}` }),
        h('span', { class: 'grow' }, h('b', { text: r.name }), h('span', { class: 'muted small', text: `  from ${r.owner_email} · ${ROLE[r.role]}` })),
        r.here ? h('button', { class: 'btn small', text: 'Open', onclick: () => { close(); const nb = nbstore.list().find(n => n.cloud?.id === r.id); if (nb) location.hash = `#/nb/${nb.id}`; } })
          : h('button', { class: 'btn small primary', text: 'Add', onclick: async () => {
            close();
            try { const nb = await sync.addShared(r, busy); busy(null); toast(`"${nb.name}" added. It stays in sync.`); location.hash = `#/nb/${nb.id}`; } catch (e) { busy(null); toast(errText(e)); }
          } }))));
    },
  });
}
