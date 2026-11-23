// The online part of sharing, behind one small interface:
//   Supabase (the real service; see supabase/schema.sql and docs/SHARING.md), or
//   an in-memory stand-in used by the automated checks (two pretend users, no network).
import { CLOUD } from './config.js';
import { platform } from '../platform.js';
import { loadScript } from '../notes/sources.js';

const BUCKET = 'notebook-files';
export const configured = () => !!(platform.mock || (CLOUD.url && CLOUD.key));

let backend = null;
export async function getBackend() {
  if (backend) return backend;
  backend = platform.mock ? memoryBackend() : await supabaseBackend();
  return backend;
}

/* ---------- Supabase ---------- */
async function supabaseBackend() {
  const lib = await loadScript('@supabase/supabase-js/dist/umd/supabase.js', 'supabase');
  const sb = lib.createClient(CLOUD.url, CLOUD.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'studyhall-auth' } });
  const ok = ({ data, error }) => { if (error) throw new Error(error.message || String(error)); return data; };
  const me = async () => (await sb.auth.getSession()).data.session?.user || null;
  return {
    kind: 'supabase',
    async user() { const u = await me(); return u ? { id: u.id, email: u.email.toLowerCase() } : null; },
    onAuth(fn) { sb.auth.onAuthStateChange((_e, s) => fn(s?.user ? { id: s.user.id, email: s.user.email.toLowerCase() } : null)); },
    // Sign-in with a 6-digit code sent by email: works in the desktop app, on tablets and in browsers alike.
    async sendCode(email) { ok(await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })); },
    async verifyCode(email, token) { ok(await sb.auth.verifyOtp({ email, token, type: 'email' })); return this.user(); },
    async signOut() { await sb.auth.signOut(); },

    async createNotebook(row) { return ok(await sb.from('notebooks').insert(row).select().single()); },
    async updateNotebook(id, patch) { ok(await sb.from('notebooks').update(patch).eq('id', id)); },
    async deleteNotebook(id) {
      const files = ok(await sb.storage.from(BUCKET).list(id, { limit: 1000 }));
      if (files.length) ok(await sb.storage.from(BUCKET).remove(files.map(f => `${id}/${f.name}`)));
      ok(await sb.from('notebooks').delete().eq('id', id));
    },
    async getNotebook(id) { return ok(await sb.from('notebooks').select().eq('id', id).maybeSingle()); },
    /** Notebooks I own or that were shared with me, each with my role. */
    async listNotebooks() {
      const u = await me();
      const rows = ok(await sb.from('notebooks').select('id,name,color,owner,owner_email,updated_at'));
      const mine = ok(await sb.from('members').select('notebook_id,role').eq('email', u.email.toLowerCase()));
      return rows.map(r => ({ ...r, role: r.owner === u.id ? 'owner' : (mine.find(m => m.notebook_id === r.id)?.role || 'viewer') }));
    },
    async members(id) { return ok(await sb.from('members').select('email,role,invited_at').eq('notebook_id', id).order('invited_at')); },
    async invite(id, email, role) { ok(await sb.from('members').upsert({ notebook_id: id, email, role })); },
    async removeMember(id, email) { ok(await sb.from('members').delete().eq('notebook_id', id).eq('email', email)); },

    async pages(id, since) {
      let q = sb.from('pages').select('page_id,data,version,updated_at,updated_by').eq('notebook_id', id);
      if (since) q = q.gt('updated_at', since);
      return ok(await q);
    },
    async putPage(id, pageId, data) { return ok(await sb.from('pages').upsert({ notebook_id: id, page_id: pageId, data }).select('version,updated_at').single()); },
    async deletePage(id, pageId) { ok(await sb.from('pages').delete().eq('notebook_id', id).eq('page_id', pageId)); },

    async upload(id, file, bytes, type) { ok(await sb.storage.from(BUCKET).upload(`${id}/${file}`, new Blob([bytes], { type }), { upsert: true, contentType: type })); },
    async download(id, file) { return new Uint8Array(await ok(await sb.storage.from(BUCKET).download(`${id}/${file}`)).arrayBuffer()); },
    async fileList(id) { return ok(await sb.storage.from(BUCKET).list(id, { limit: 10000 })).map(f => f.name); },

    async setLink(id, enabled, token) { ok(await sb.from('notebooks').update({ link_enabled: enabled, ...(token ? { link_token: token } : {}) }).eq('id', id)); },
    async byLink(token) { return ok(await sb.rpc('shared_by_link', { token })); },

    /** Live changes to one notebook. Returns a function that stops listening. */
    subscribe(id, { onPage, onNotebook, onGone }) {
      const ch = sb.channel(`nb-${id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pages', filter: `notebook_id=eq.${id}` }, p => onPage(p.eventType === 'DELETE' ? { page_id: p.old.page_id, deleted: true } : p.new))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notebooks', filter: `id=eq.${id}` }, p => (p.eventType === 'DELETE' ? onGone?.() : onNotebook(p.new)))
        .subscribe();
      return () => sb.removeChannel(ch);
    },
  };
}

/* ---------- in-memory stand-in for the automated checks ---------- */
function memoryBackend() {
  const db = { users: new Map(), notebooks: new Map(), members: [], pages: new Map(), files: new Map(), subs: new Set() };
  let current = null;
  let seq = 0;
  const authFns = new Set();
  const now = () => new Date(Date.now() + seq++).toISOString();
  const need = () => { if (!current) throw new Error('Not signed in'); return current; };
  const role = id => {
    const nb = db.notebooks.get(id);
    if (!nb || !current) return null;
    if (nb.owner === current.id) return 'owner';
    return db.members.find(m => m.notebook_id === id && m.email === current.email)?.role || null;
  };
  const canEdit = id => ['owner', 'editor'].includes(role(id));
  const emit = (id, kind, row) => db.subs.forEach(s => { if (s.id === id && s.user !== current?.email) s[kind]?.(row); });
  const api = {
    kind: 'memory',
    lastCode: null,
    async user() { return current ? { ...current } : null; },
    onAuth(fn) { authFns.add(fn); },
    async sendCode(email) { if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Unable to validate email address: invalid format'); api.lastCode = '123456'; },
    async verifyCode(email, token) {
      if (token !== '123456') throw new Error('Token has expired or is invalid');
      if (!db.users.has(email)) db.users.set(email, { id: `u-${db.users.size + 1}`, email });
      current = { ...db.users.get(email) };
      authFns.forEach(fn => fn(current));
      return { ...current };
    },
    async signOut() { current = null; authFns.forEach(fn => fn(null)); },
    /** Test helper: act as another user for a moment. */
    async as(email, fn) {
      const keep = current;
      if (!db.users.has(email)) db.users.set(email, { id: `u-${db.users.size + 1}`, email });
      current = { ...db.users.get(email) };
      try { return await fn(api); } finally { current = keep; }
    },

    async createNotebook(row) { const u = need(); const r = { id: crypto.randomUUID(), owner: u.id, owner_email: u.email, link_enabled: false, link_token: null, updated_at: now(), ...row }; db.notebooks.set(r.id, r); return { ...r }; },
    async updateNotebook(id, patch) { if (!canEdit(id)) throw new Error('permission denied'); const r = Object.assign(db.notebooks.get(id), patch, { updated_at: now() }); emit(id, 'onNotebook', { ...r }); },
    async deleteNotebook(id) { if (role(id) !== 'owner') throw new Error('permission denied'); db.notebooks.delete(id); emit(id, 'onGone'); },
    async getNotebook(id) { return role(id) ? { ...db.notebooks.get(id) } : null; },
    async listNotebooks() { need(); return [...db.notebooks.values()].filter(n => role(n.id)).map(n => ({ ...n, role: role(n.id) })); },
    async members(id) { if (!role(id)) throw new Error('permission denied'); return db.members.filter(m => m.notebook_id === id).map(m => ({ ...m })); },
    async invite(id, email, r) { if (role(id) !== 'owner') throw new Error('permission denied'); db.members = db.members.filter(m => !(m.notebook_id === id && m.email === email)); db.members.push({ notebook_id: id, email, role: r, invited_at: now() }); },
    async removeMember(id, email) { if (role(id) !== 'owner' && email !== current?.email) throw new Error('permission denied'); db.members = db.members.filter(m => !(m.notebook_id === id && m.email === email)); },
    async pages(id, since) { if (!role(id)) throw new Error('permission denied'); return [...db.pages.values()].filter(p => p.notebook_id === id && (!since || p.updated_at > since)).map(p => structuredClone(p)); },
    async putPage(id, pageId, data) {
      if (!canEdit(id)) throw new Error('new row violates row-level security policy');
      const key = `${id}/${pageId}`;
      const old = db.pages.get(key);
      const row = { notebook_id: id, page_id: pageId, data: structuredClone(data), version: (old?.version || 0) + 1, updated_at: now(), updated_by: current.email };
      db.pages.set(key, row);
      emit(id, 'onPage', structuredClone(row));
      return { version: row.version, updated_at: row.updated_at };
    },
    async deletePage(id, pageId) { if (!canEdit(id)) throw new Error('permission denied'); db.pages.delete(`${id}/${pageId}`); emit(id, 'onPage', { page_id: pageId, deleted: true }); },
    async upload(id, file, bytes) { if (!canEdit(id)) throw new Error('permission denied'); db.files.set(`${id}/${file}`, new Uint8Array(bytes)); },
    async download(id, file) { const nb = db.notebooks.get(id); if (!role(id) && !nb?.link_enabled) throw new Error('Object not found'); const b = db.files.get(`${id}/${file}`); if (!b) throw new Error('Object not found'); return new Uint8Array(b); },
    async fileList(id) { return [...db.files.keys()].filter(k => k.startsWith(`${id}/`)).map(k => k.slice(id.length + 1)); },
    async setLink(id, enabled, token) { if (role(id) !== 'owner') throw new Error('Only the owner can change the view-only link'); Object.assign(db.notebooks.get(id), { link_enabled: enabled, ...(token ? { link_token: token } : {}) }); },
    async byLink(token) {
      const nb = [...db.notebooks.values()].find(n => n.link_token === token && n.link_enabled);
      if (!nb) return null;
      return { id: nb.id, name: nb.name, color: nb.color, meta: nb.meta, owner: nb.owner_email, pages: [...db.pages.values()].filter(p => p.notebook_id === nb.id).map(p => ({ page_id: p.page_id, data: p.data })) };
    },
    subscribe(id, handlers) { const s = { id, user: current?.email, ...handlers }; db.subs.add(s); return () => db.subs.delete(s); },
  };
  return api;
}
