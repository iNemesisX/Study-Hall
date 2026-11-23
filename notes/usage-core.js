// Daily AI request counting, shared by the desktop app (notes/usage.js) and the
// tablet / browser version (web/bridge.js). The host supplies storage and a
// "something changed" callback.
//
// Gemini's free tier allows a fixed number of requests per day per model (it resets
// at midnight Pacific time). The API does not report how many are left, so the app
// counts its own requests, starts from an estimate of the limit, and corrects that
// estimate from the provider's own "limit reached" error when one arrives.
const DEFAULT_LIMIT = { gemini: 20 }; // estimate for free Gemini Flash models; corrected when the API reports the real value

function createUsage({ read, write, changed }) {
  let state = null;
  let userLimits = {};
  const dayKey = (provider) => (provider === 'gemini'
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date())
    : new Intl.DateTimeFormat('en-CA').format(new Date()));
  const load = () => { if (!state) { try { state = read() || {}; } catch { state = {}; } } return state; };
  function entry(provider) {
    const s = load();
    const today = dayKey(provider);
    const e = (s[provider] ||= { day: today, count: 0 });
    if (e.day !== today) { e.day = today; e.count = 0; e.maxed = false; }
    return e;
  }
  function persist() { try { write(state); } catch { /* best effort */ } changed?.(); }
  function hoursToReset(provider) {
    const now = new Date();
    if (provider !== 'gemini') return 24 - now.getHours() - now.getMinutes() / 60;
    const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(now);
    const hh = +p.find((x) => x.type === 'hour').value % 24, mm = +p.find((x) => x.type === 'minute').value;
    return 24 - hh - mm / 60;
  }
  return {
    /** Limits typed by the user in AI setup win over learned and default ones. */
    setUserLimits(limits) { userLimits = limits || {}; },
    status(provider) {
      if (provider === 'ollama') return { provider, count: 0, limit: null, level: 'none' };
      const e = entry(provider);
      const limit = userLimits[provider] || e.learned || DEFAULT_LIMIT[provider] || null;
      const out = { provider, count: e.count, limit, source: userLimits[provider] ? 'yours' : e.learned ? 'reported' : 'estimate', hoursToReset: Math.max(0, Math.round(hoursToReset(provider) * 10) / 10) };
      if (!limit) return { ...out, level: 'none' };
      out.left = Math.max(0, limit - e.count);
      const pct = e.count / limit;
      out.level = e.maxed || pct >= 1 ? 'max' : pct >= 0.9 ? 'high' : pct >= 0.75 ? 'warn' : 'ok';
      return out;
    },
    /** Call once for every request sent to a provider. */
    bump(provider) { if (provider === 'ollama') return; entry(provider).count++; persist(); },
    /** The provider said the daily limit is reached; quotaValue is its real limit when given. */
    reachedDailyLimit(provider, quotaValue) {
      const e = entry(provider);
      if (Number.isFinite(+quotaValue) && +quotaValue > 0) e.learned = +quotaValue;
      else if (!userLimits[provider]) e.learned = Math.max(1, e.count - 1);
      e.maxed = true;
      persist();
    },
  };
}

module.exports = { createUsage };
