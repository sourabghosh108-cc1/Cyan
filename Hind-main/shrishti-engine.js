/**
 * Shrishti AI Multi-Model Cushioning & Quota Engine
 * Supported Models:
 * - cyan pineapple model a (OpenRouter free)
 * - lemon model b (Gemini Flash Latest)
 * - hind cyan b (Groq GPT-OSS-20B)
 * - orange d (Mistral Open-Mistral-7B)
 * 
 * Cascade Cushioning: If the chosen model fails/rate-limits,
 * it cushions and fails over to the next available models sequentially.
 * 
 * Daily Limit: 15 questions per user per day.
 */

const SHRISHTI_CONFIG = {
  DAILY_LIMIT: 15,
  MODELS: {
    'cyan-pineapple-a': {
      id: 'cyan-pineapple-a',
      name: 'cyan pineapple model a',
      badge: 'OpenRouter',
      provider: 'openrouter',
      apiKey: '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',
      modelId: 'openrouter/free'
    },
    'lemon-model-b': {
      id: 'lemon-model-b',
      name: 'lemon model b',
      badge: 'Gemini',
      provider: 'gemini',
      apiKey: 'AQ.Ab8RN6JIXnc0-oy_47NrMZ0Il0nlgm9g7czX88px8B8eqyqPig',
      modelId: 'gemini-flash-latest'
    },
    'hind-cyan-b': {
      id: 'hind-cyan-b',
      name: 'hind cyan b',
      badge: 'Groq',
      provider: 'groq',
      apiKey: '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',
      modelId: 'openai/gpt-oss-20b'
    },
    'orange-d': {
      id: 'orange-d',
      name: 'orange d',
      badge: 'Mistral',
      provider: 'mistral',
      apiKey: 'mstrl_HKF5qt7L9gOx48nn0dVyfGJg0sBzEYOX_35SQAU',
      modelId: 'open-mistral-7b'
    }
  },
  DEFAULT_ORDER: ['cyan-pineapple-a', 'lemon-model-b', 'hind-cyan-b', 'orange-d']
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
async function requestShrishtiAiWithCushion(prompt, primaryModelKey = 'cyan-pineapple-a', onFallbackNotify = null) {
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

// Ensure badge updates on DOM load
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    updateShrishtiQuotaBadges();
  });
}
