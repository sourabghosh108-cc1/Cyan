/**
 * Shrishti AI Multi-Model Cushioning & Quota Engine
 * Supported Models:
 * - Lemon Pineapple a (Mistral Open-Mistral-7B)
 * - Cyan Hind b (OpenRouter free)
 * 
 * Cascade Cushioning: If the chosen model fails/rate-limits,
 * it cushions and fails over to the other model sequentially.
 * 
 * Daily Limit: 15 questions per user per day.
 */

const SHRISHTI_CONFIG = {
  DAILY_LIMIT: 15,
  SEARCH_DAILY_LIMIT: 30,
  MODELS: {
    'lemon-pineapple-a': {
      id: 'lemon-pineapple-a',
      name: 'Lemon Pineapple a',
      badge: 'Mistral',
      provider: 'mistral',
      apiKey: 'mstrl_HKF5qt7L9gOx48nn0dVyfGJg0sBzEYOX_35SQAU',
      modelId: 'open-mistral-7b'
    },
    'cyan-hind-b': {
      id: 'cyan-hind-b',
      name: 'Cyan Hind b',
      badge: 'OpenRouter',
      provider: 'openrouter',
      apiKey: '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',
      modelId: 'meta-llama/llama-3.1-8b-instruct:free'
    }
  },
  DEFAULT_ORDER: ['lemon-pineapple-a', 'cyan-hind-b']
};

// ── Daily Quota Management (15 queries/day) ──
function getTodayDateKey() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getShrishtiQuota() {
  try {
    const today = getTodayDateKey();
    const stored = localStorage.getItem('shrishti_daily_quota');
    if (!stored) {
      return { date: today, count: 0, limit: SHRISHTI_CONFIG.DAILY_LIMIT };
    }
    const parsed = JSON.parse(stored);
    if (parsed.date !== today) {
      const reset = { date: today, count: 0, limit: SHRISHTI_CONFIG.DAILY_LIMIT };
      localStorage.setItem('shrishti_daily_quota', JSON.stringify(reset));
      return reset;
    }
    return { date: today, count: parsed.count || 0, limit: SHRISHTI_CONFIG.DAILY_LIMIT };
  } catch (e) {
    return { date: getTodayDateKey(), count: 0, limit: SHRISHTI_CONFIG.DAILY_LIMIT };
  }
}

function incrementShrishtiQuota() {
  try {
    const q = getShrishtiQuota();
    q.count += 1;
    localStorage.setItem('shrishti_daily_quota', JSON.stringify(q));
    updateShrishtiQuotaBadges();
    return q;
  } catch (e) {
    return { date: getTodayDateKey(), count: 1, limit: SHRISHTI_CONFIG.DAILY_LIMIT };
  }
}

function canAskShrishti() {
  const q = getShrishtiQuota();
  return q.count < q.limit;
}

function getShrishtiRemainingQuestions() {
  const q = getShrishtiQuota();
  return Math.max(0, q.limit - q.count);
}

function updateShrishtiQuotaBadges() {
  const remaining = getShrishtiRemainingQuestions();
  // Update all badge elements by class (search.html, index.html)
  document.querySelectorAll('.shrishti-quota-badge').forEach(el => {
    el.textContent = `${remaining}/${SHRISHTI_CONFIG.DAILY_LIMIT} daily queries left`;
    if (remaining <= 0) {
      el.style.background = 'rgba(239, 68, 68, 0.3)';
    } else if (remaining <= 3) {
      el.style.background = 'rgba(245, 158, 11, 0.3)';
    }
  });
  // Also update standalone badge if present (shrishti/index.html)
  const standaloneBadge = document.getElementById('shrishtiStandaloneQuotaBadge');
  if (standaloneBadge) {
    standaloneBadge.textContent = `${remaining}/15 queries left today`;
    if (remaining <= 0) standaloneBadge.style.background = 'rgba(239,68,68,0.4)';
    else if (remaining <= 3) standaloneBadge.style.background = 'rgba(245,158,11,0.4)';
  }
}

// ── Search AI Daily Quota Management (30 searches/day per IP) ──
let _cachedClientIp = null;
async function getSearchClientIp() {
  if (_cachedClientIp) return _cachedClientIp;
  try {
    const cached = sessionStorage.getItem('hind_client_ip');
    if (cached) {
      _cachedClientIp = cached;
      return cached;
    }
  } catch (e) {}

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (data && data.ip) {
        _cachedClientIp = String(data.ip).trim();
        try { sessionStorage.setItem('hind_client_ip', _cachedClientIp); } catch (e) {}
        return _cachedClientIp;
      }
    }
  } catch (e) {}

  // Fallback to stable per-device / browser ID
  try {
    let anon = localStorage.getItem('hind_anon_ip_id');
    if (!anon) {
      anon = 'ip_' + Math.random().toString(36).substring(2, 12);
      localStorage.setItem('hind_anon_ip_id', anon);
    }
    _cachedClientIp = anon;
    return anon;
  } catch (e) {
    return 'default_client';
  }
}

function getSearchAiQuotaKey(ip) {
  const today = getTodayDateKey();
  const safeIp = (ip || 'default').replace(/[^a-zA-Z0-9_.-]/g, '_');
  return `shrishti_search_quota_${safeIp}_${today}`;
}

function getSearchAiQuota(ip = 'default') {
  const today = getTodayDateKey();
  const key = getSearchAiQuotaKey(ip);
  try {
    const stored = localStorage.getItem(key);
    if (!stored) {
      return { date: today, count: 0, limit: SHRISHTI_CONFIG.SEARCH_DAILY_LIMIT };
    }
    const parsed = JSON.parse(stored);
    if (parsed.date !== today) {
      const reset = { date: today, count: 0, limit: SHRISHTI_CONFIG.SEARCH_DAILY_LIMIT };
      localStorage.setItem(key, JSON.stringify(reset));
      return reset;
    }
    return { date: today, count: parsed.count || 0, limit: SHRISHTI_CONFIG.SEARCH_DAILY_LIMIT };
  } catch (e) {
    return { date: today, count: 0, limit: SHRISHTI_CONFIG.SEARCH_DAILY_LIMIT };
  }
}

function canPerformSearchAi(ip = 'default') {
  const q = getSearchAiQuota(ip);
  return q.count < q.limit;
}

function incrementSearchAiQuota(ip = 'default') {
  try {
    const key = getSearchAiQuotaKey(ip);
    const q = getSearchAiQuota(ip);
    q.count += 1;
    localStorage.setItem(key, JSON.stringify(q));
    return q;
  } catch (e) {
    return { date: getTodayDateKey(), count: 1, limit: SHRISHTI_CONFIG.SEARCH_DAILY_LIMIT };
  }
}

function getSearchAiRemaining(ip = 'default') {
  const q = getSearchAiQuota(ip);
  return Math.max(0, q.limit - q.count);
}

if (typeof window !== 'undefined') {
  window.getSearchClientIp = getSearchClientIp;
  window.getSearchAiQuota = getSearchAiQuota;
  window.canPerformSearchAi = canPerformSearchAi;
  window.incrementSearchAiQuota = incrementSearchAiQuota;
  window.getSearchAiRemaining = getSearchAiRemaining;
  // Eagerly prefetch IP in background
  getSearchClientIp().catch(() => {});
}

// ── Provider API Invokers ──
async function callOpenRouter(prompt, cfg) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hind.com',
        'X-Title': 'Hind Search Engine'
      },
      body: JSON.stringify({
        model: cfg.modelId,
        messages: [
          { role: 'system', content: 'You are Shrishti AI, a helpful and precise assistant by Hind.com.' },
          { role: 'user', content: prompt }
        ]
      })
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content;
    }
    if (data.error && data.error.message) throw new Error(data.error.message);
    throw new Error('Invalid OpenRouter payload');
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callGemini(prompt, cfg) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.modelId}:generateContent?key=${cfg.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: `You are Shrishti AI, a helpful and accurate assistant by Hind.com. Answer concisely:\n\n${prompt}` }
            ]
          }
        ]
      })
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
      return data.candidates[0].content.parts.map(p => p.text).join('\n');
    }
    if (data.error && data.error.message) throw new Error(data.error.message);
    throw new Error('Invalid Gemini payload');
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callGroq(prompt, cfg) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: cfg.modelId,
        messages: [
          { role: 'system', content: 'You are Shrishti AI, a helpful and intelligent assistant by Hind.com.' },
          { role: 'user', content: prompt }
        ]
      })
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content;
    }
    if (data.error && data.error.message) throw new Error(data.error.message);
    throw new Error('Invalid Groq payload');
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callMistral(prompt, cfg) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: cfg.modelId,
        messages: [
          { role: 'system', content: 'You are Shrishti AI, a helpful and articulate assistant by Hind.com.' },
          { role: 'user', content: prompt }
        ]
      })
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content;
    }
    if (data.error && data.error.message) throw new Error(data.error.message);
    throw new Error('Invalid Mistral payload');
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Multi-Model Cushioning Fallback Engine ──
async function requestShrishtiAiWithCushion(prompt, primaryModelKey = 'lemon-pineapple-a', onFallbackNotify = null) {
  // Build waterfall cascade starting with primaryModelKey, followed by others
  const order = [primaryModelKey, ...SHRISHTI_CONFIG.DEFAULT_ORDER.filter(k => k !== primaryModelKey)];
  const errors = [];

  for (let i = 0; i < order.length; i++) {
    const key = order[i];
    const cfg = SHRISHTI_CONFIG.MODELS[key];
    if (!cfg) continue;

    try {
      if (i > 0 && typeof onFallbackNotify === 'function') {
        onFallbackNotify(cfg.name, i);
      }
      let text = '';
      if (cfg.provider === 'openrouter') {
        text = await callOpenRouter(prompt, cfg);
      } else if (cfg.provider === 'gemini') {
        text = await callGemini(prompt, cfg);
      } else if (cfg.provider === 'groq') {
        text = await callGroq(prompt, cfg);
      } else if (cfg.provider === 'mistral') {
        text = await callMistral(prompt, cfg);
      }
      if (text && text.trim()) {
        return {
          content: text.trim(),
          modelUsed: cfg.name,
          modelKey: cfg.id,
          cushioned: i > 0,
          attempts: i + 1
        };
      }
      throw new Error(`Empty response from ${cfg.name}`);
    } catch (err) {
      console.warn(`Shrishti cushion: ${cfg.name} failed (${err.message}), trying next cushion...`);
      errors.push({ model: cfg.name, error: err.message });
    }
  }

  throw new Error(`All Shrishti AI models were unavailable: ${errors.map(e => `${e.model}: ${e.error}`).join('; ')}`);
}

// Global HTML Escape Utility
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
if (typeof window !== 'undefined') {
  window.escapeHtml = escapeHtml;
}

// Ensure badge updates on DOM load
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      updateShrishtiQuotaBadges();
    });
  } else {
    updateShrishtiQuotaBadges();
  }
}

