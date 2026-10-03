/**
 * Shrishti AI Secure Client Engine for Hind Search
 * 
 * ARCHITECTURE:
 * Browser / Frontend  ─── POST /api/ai ───►  Vercel Serverless Function (api/ai.py)
 *                                                    │
 *                                        Reads AI_API_KEY from Server Env
 *                                                    │
 *                                                    ▼
 *                                            Single AI Provider
 * 
 * SECURITY:
 * - NO API keys are stored in this frontend file.
 * - NO direct third-party AI provider URLs are invoked from the browser.
 * - All requests route through the server-side /api/ai endpoint.
 * 
 * CREDIT SYSTEM:
 * - 100 credits per user / IP.
 * - 5 credits consumed per successful AI response.
 * - Failed provider requests consume 0 credits.
 * - When credits < 5, AI requests are rejected while normal search continues uninterrupted.
 */

const SHRISHTI_CONFIG = {
  INITIAL_CREDITS: 100,
  CREDIT_COST_QUERY: 5,
  // Metadata for UI selectors (all keys removed; calls routed through /api/ai)
  MODELS: {
    'lemon-model-b': {
      id: 'lemon-model-b',
      name: 'Shrishti AI (Gemini)',
      badge: 'Gemini'
    },
    'cyan-pineapple-a': {
      id: 'cyan-pineapple-a',
      name: 'Shrishti AI Default',
      badge: 'Hind AI'
    },
    'hind-cyan-b': {
      id: 'hind-cyan-b',
      name: 'Shrishti Fast (Groq)',
      badge: 'Groq'
    },
    'orange-d': {
      id: 'orange-d',
      name: 'Shrishti Chat (Mistral)',
      badge: 'Mistral'
    }
  },
  DEFAULT_ORDER: ['lemon-model-b', 'cyan-pineapple-a', 'hind-cyan-b', 'orange-d']
};

// ── Resolve Server-Side Endpoint ──
function getAiApiEndpoint() {
  const isProd = window.location.protocol.startsWith('http') &&
                 !window.location.hostname.includes('localhost') &&
                 !window.location.hostname.includes('127.0.0.1');
  const base = isProd ? '' : (window.location.port === '8000' ? '' : 'http://127.0.0.1:8000');
  return `${base}/api/ai`;
}

// ── 100 Credit System Management ──
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
    const stored = localStorage.getItem('hind_ai_credits_data');
    if (!stored) {
      const initial = { date: today, credits: SHRISHTI_CONFIG.INITIAL_CREDITS };
      localStorage.setItem('hind_ai_credits_data', JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(stored);
    if (parsed.date !== today) {
      const reset = { date: today, credits: SHRISHTI_CONFIG.INITIAL_CREDITS };
      localStorage.setItem('hind_ai_credits_data', JSON.stringify(reset));
      return reset;
    }
    return {
      date: today,
      credits: typeof parsed.credits === 'number' ? parsed.credits : SHRISHTI_CONFIG.INITIAL_CREDITS
    };
  } catch (e) {
    return { date: getTodayDateKey(), credits: SHRISHTI_CONFIG.INITIAL_CREDITS };
  }
}

function saveShrishtiCredits(creditsRemaining) {
  try {
    const today = getTodayDateKey();
    const validCredits = Math.max(0, Math.min(SHRISHTI_CONFIG.INITIAL_CREDITS, creditsRemaining));
    localStorage.setItem('hind_ai_credits_data', JSON.stringify({ date: today, credits: validCredits }));
    updateShrishtiQuotaBadges();
  } catch (e) {
    // Ignore localStorage write errors in private browsing
  }
}

function canAskShrishti() {
  const q = getShrishtiQuota();
  return q.credits >= SHRISHTI_CONFIG.CREDIT_COST_QUERY;
}

function getShrishtiRemainingQuestions() {
  const q = getShrishtiQuota();
  return q.credits;
}

// Retain legacy method name for backward compatibility with existing UI
function incrementShrishtiQuota() {
  // Credits are deducted server-side upon successful AI response.
  // This helper syncs local display.
  updateShrishtiQuotaBadges();
}

function updateShrishtiQuotaBadges() {
  const remaining = getShrishtiRemainingQuestions();
  const total = SHRISHTI_CONFIG.INITIAL_CREDITS;

  // Update badge elements in search.html, index.html
  document.querySelectorAll('.shrishti-quota-badge').forEach(el => {
    el.textContent = `${remaining}/${total} credits left`;
    if (remaining < SHRISHTI_CONFIG.CREDIT_COST_QUERY) {
      el.style.background = 'rgba(239, 68, 68, 0.35)';
      el.style.color = '#fca5a5';
    } else if (remaining <= 25) {
      el.style.background = 'rgba(245, 158, 11, 0.3)';
      el.style.color = '#fde68a';
    }
  });

  // Standalone app badge (apps/webstore/shrishti/index.html)
  const standaloneBadge = document.getElementById('shrishtiStandaloneQuotaBadge');
  if (standaloneBadge) {
    standaloneBadge.textContent = `${remaining}/${total} credits left`;
    if (remaining < SHRISHTI_CONFIG.CREDIT_COST_QUERY) {
      standaloneBadge.style.background = 'rgba(239, 68, 68, 0.4)';
    } else if (remaining <= 25) {
      standaloneBadge.style.background = 'rgba(245, 158, 11, 0.4)';
    }
  }
}

// ── Secure Server-Side Invocation ──
/**
 * Calls Hind's secure server-side /api/ai endpoint.
 * No API key is sent from the browser.
 */
async function callSecureAiEndpoint(prompt, context = '') {
  const endpoint = getAiApiEndpoint();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 18000);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({
        message: prompt,
        context: context || ''
      })
    });

    clearTimeout(timeoutId);

    const data = await res.json().catch(() => null);

    if (!data) {
      throw new Error(`Server returned HTTP ${res.status}`);
    }

    // Sync remaining credits from server response
    if (typeof data.credits_remaining === 'number') {
      saveShrishtiCredits(data.credits_remaining);
    }

    if (!res.ok || !data.success) {
      if (data.credits_remaining !== undefined && data.credits_remaining < SHRISHTI_CONFIG.CREDIT_COST_QUERY) {
        throw new Error('AI credits exhausted. Normal web, image, video, and news search continue working normally.');
      }
      throw new Error(data.error || `AI service returned error (HTTP ${res.status})`);
    }

    return {
      content: (data.answer || '').trim(),
      modelUsed: 'Shrishti AI',
      modelKey: 'shrishti-ai',
      creditsRemaining: data.credits_remaining
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Main UI Interface Function ──
/**
 * Main AI entry point used by search.html, index.html, and Shrishti Web App.
 * Signature preserved so no HTML or UI files need modification.
 */
async function requestShrishtiAiWithCushion(prompt, primaryModelKey = 'lemon-model-b', onFallbackNotify = null) {
  if (!canAskShrishti()) {
    throw new Error('AI credits exhausted. You have 0 credits remaining. Web, image, video, and news search continue working normally.');
  }

  const result = await callSecureAiEndpoint(prompt);
  
  if (!result.content) {
    throw new Error('No answer received from AI service.');
  }

  return {
    content: result.content,
    modelUsed: 'Shrishti AI',
    modelKey: 'shrishti-ai',
    cushioned: false,
    attempts: 1,
    creditsRemaining: result.creditsRemaining
  };
}

// Background sync on load to fetch current credits from server
async function syncCreditsWithServer() {
  try {
    const endpoint = getAiApiEndpoint();
    const res = await fetch(endpoint, { method: 'GET' });
    if (res.ok) {
      const data = await res.json();
      if (typeof data.credits_remaining === 'number') {
        saveShrishtiCredits(data.credits_remaining);
      }
    }
  } catch (e) {
    // Graceful fallback to local credits
  }
}

// Ensure badges and initial state update on DOM load
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    updateShrishtiQuotaBadges();
    syncCreditsWithServer();
  });
}
