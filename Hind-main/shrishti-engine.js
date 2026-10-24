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
  PRO_CREDITS_DAILY_LIMIT: 10,
  CREDIT_COSTS: {
    IMAGE_GEN: 2,
    FILE_ANALYSIS: 5
  },
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
      modelId: 'mistralai/mistral-7b-instruct:free'
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

// ── Extra Pro/Creative Daily Credits (10 credits/day: 2 per image, 5 per file analysis) ──
function getShrishtiProCredits() {
  try {
    const today = getTodayDateKey();
    const stored = localStorage.getItem('shrishti_pro_credits');
    if (!stored) {
      const init = { date: today, used: 0, limit: SHRISHTI_CONFIG.PRO_CREDITS_DAILY_LIMIT };
      localStorage.setItem('shrishti_pro_credits', JSON.stringify(init));
      return init;
    }
    const parsed = JSON.parse(stored);
    if (parsed.date !== today) {
      const reset = { date: today, used: 0, limit: SHRISHTI_CONFIG.PRO_CREDITS_DAILY_LIMIT };
      localStorage.setItem('shrishti_pro_credits', JSON.stringify(reset));
      return reset;
    }
    return { date: today, used: parsed.used || 0, limit: SHRISHTI_CONFIG.PRO_CREDITS_DAILY_LIMIT };
  } catch (e) {
    return { date: getTodayDateKey(), used: 0, limit: SHRISHTI_CONFIG.PRO_CREDITS_DAILY_LIMIT };
  }
}

function getShrishtiRemainingProCredits() {
  const c = getShrishtiProCredits();
  return Math.max(0, c.limit - c.used);
}

function canSpendProCredits(amount) {
  return getShrishtiRemainingProCredits() >= amount;
}

function spendProCredits(amount) {
  const c = getShrishtiProCredits();
  if (c.used + amount > c.limit) {
    throw new Error(`Insufficient Pro Credits. Required: ${amount}, Remaining: ${Math.max(0, c.limit - c.used)}/10`);
  }
  c.used += amount;
  localStorage.setItem('shrishti_pro_credits', JSON.stringify(c));
  updateShrishtiQuotaBadges();
  return c;
}

function updateShrishtiQuotaBadges() {
  const remaining = getShrishtiRemainingQuestions();
  const proRemaining = getShrishtiRemainingProCredits();

  // Update all standard query badge elements by class
  document.querySelectorAll('.shrishti-quota-badge').forEach(el => {
    el.textContent = `${remaining}/${SHRISHTI_CONFIG.DAILY_LIMIT} daily queries left`;
    if (remaining <= 0) {
      el.style.background = 'rgba(239, 68, 68, 0.3)';
    } else if (remaining <= 3) {
      el.style.background = 'rgba(245, 158, 11, 0.3)';
    }
  });

  // Update Pro Credit badges
  document.querySelectorAll('.shrishti-pro-badge').forEach(el => {
    el.innerHTML = `⚡ ${proRemaining}/${SHRISHTI_CONFIG.PRO_CREDITS_DAILY_LIMIT} Pro Credits`;
    el.title = `Pro Credits: ${proRemaining}/10 left today (2 per image, 5 per document/image analysis)`;
    if (proRemaining <= 0) {
      el.style.background = 'rgba(239, 68, 68, 0.35)';
      el.style.color = '#ef4444';
    } else if (proRemaining <= 4) {
      el.style.background = 'rgba(245, 158, 11, 0.3)';
      el.style.color = '#f59e0b';
    } else {
      el.style.background = 'rgba(245, 158, 11, 0.2)';
      el.style.color = '#f59e0b';
    }
  });

  // Also update standalone badge if present (shrishti/index.html)
  const standaloneBadge = document.getElementById('shrishtiStandaloneQuotaBadge');
  if (standaloneBadge) {
    standaloneBadge.textContent = `${remaining}/15 queries left`;
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
  } catch (e) { }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (data && data.ip) {
        _cachedClientIp = String(data.ip).trim();
        try { sessionStorage.setItem('hind_client_ip', _cachedClientIp); } catch (e) { }
        return _cachedClientIp;
      }
    }
  } catch (e) { }

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
  getSearchClientIp().catch(() => { });
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

// ── Image Generation Engine (2 credits per image, 5 images/day) ──
async function generateShrishtiImage(prompt) {
  const trimmed = (prompt || '').trim();
  if (!trimmed) throw new Error('Please enter a description for the image to generate.');

  if (!canSpendProCredits(SHRISHTI_CONFIG.CREDIT_COSTS.IMAGE_GEN)) {
    const rem = getShrishtiRemainingProCredits();
    throw new Error(`Insufficient Pro Credits. Generating an image requires 2 credits (you have ${rem}/${SHRISHTI_CONFIG.PRO_CREDITS_DAILY_LIMIT} left today). Credits reset daily.`);
  }

  // Use Pollinations AI (free, instant, high resolution, no API key required)
  const cleanPrompt = trimmed.replace(/[^\w\s,.-]/gi, ' ').trim();
  const seed = Math.floor(Math.random() * 9999999);
  const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?width=768&height=768&nologo=true&enhance=true&seed=${seed}`;

  // Preload test image
  await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(true);
    img.src = imageUrl;
    setTimeout(() => resolve(true), 3500);
  });

  // Deduct 2 credits
  spendProCredits(SHRISHTI_CONFIG.CREDIT_COSTS.IMAGE_GEN);

  return {
    imageUrl: imageUrl,
    prompt: trimmed,
    creditsUsed: SHRISHTI_CONFIG.CREDIT_COSTS.IMAGE_GEN,
    creditsRemaining: getShrishtiRemainingProCredits()
  };
}

// ── File & Document Extraction Engine (PDF, Text, Images, Code) ──
async function parseUploadedFileContent(file) {
  const fileName = file.name || 'uploaded_document';
  const fileExt = fileName.split('.').pop().toLowerCase();
  const fileType = file.type || '';

  // 1. Image Files (PNG, JPG, WEBP, GIF)
  if (fileType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(fileExt)) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve({
          type: 'image',
          fileName,
          fileExt,
          fileSize: file.size,
          dataUrl: e.target.result
        });
      };
      reader.onerror = () => reject(new Error('Failed to read image file.'));
      reader.readAsDataURL(file);
    });
  }

  // 2. PDF Files (via PDF.js)
  if (fileType === 'application/pdf' || fileExt === 'pdf') {
    return new Promise(async (resolve, reject) => {
      try {
        const arrayBuffer = await file.arrayBuffer();

        // Check if PDF.js is loaded, load dynamically if not
        if (typeof window.pdfjsLib === 'undefined') {
          await new Promise((res, rej) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            script.onload = res;
            script.onerror = rej;
            document.head.appendChild(script);
          });
          if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          }
        }

        let fullText = '';
        if (window.pdfjsLib) {
          const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
          const pdf = await loadingTask.promise;
          const numPages = Math.min(pdf.numPages, 20);
          for (let i = 1; i <= numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            if (pageText.trim()) fullText += `[Page ${i}]\n${pageText}\n\n`;
          }
        }

        if (!fullText.trim()) {
          // Fallback text decode
          const uint8 = new Uint8Array(arrayBuffer);
          const raw = new TextDecoder('latin1').decode(uint8);
          const matches = raw.match(/\(([^()]{3,})\)Tj/g) || [];
          fullText = matches.map(m => m.slice(1, -3)).join(' ');
        }

        resolve({
          type: 'pdf',
          fileName,
          fileExt: 'pdf',
          fileSize: file.size,
          text: fullText.trim() || 'Could not extract raw text from PDF (it may be scanned/image-based).'
        });
      } catch (err) {
        reject(new Error('Could not read PDF: ' + err.message));
      }
    });
  }

  // 3. Text-based files (txt, csv, md, json, doc, docx, code files)
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      resolve({
        type: 'text',
        fileName,
        fileExt,
        fileSize: file.size,
        text: e.target.result || ''
      });
    };
    reader.onerror = () => reject(new Error('Failed to read text file.'));
    reader.readAsText(file);
  });
}

// ── File Analysis Engine (5 credits per file analysis, 2 files/day) ──
async function analyzeShrishtiFile(file, userPrompt = '', primaryModelKey = 'lemon-pineapple-a', onProgress = null) {
  if (!file) throw new Error('No file provided for analysis.');

  if (!canSpendProCredits(SHRISHTI_CONFIG.CREDIT_COSTS.FILE_ANALYSIS)) {
    const rem = getShrishtiRemainingProCredits();
    throw new Error(`Insufficient Pro Credits. Analyzing a document/image requires 5 credits (you have ${rem}/${SHRISHTI_CONFIG.PRO_CREDITS_DAILY_LIMIT} left today). Credits reset daily.`);
  }

  if (typeof onProgress === 'function') onProgress('Reading and extracting file contents...');
  const parsed = await parseUploadedFileContent(file);

  let analysisResult = '';
  let modelUsed = '';

  if (parsed.type === 'image') {
    if (typeof onProgress === 'function') onProgress('Analyzing image with vision intelligence...');
    const orCfg = SHRISHTI_CONFIG.MODELS['cyan-hind-b'];
    const visionModelId = 'meta-llama/llama-3.2-11b-vision-instruct:free';
    const question = userPrompt.trim() || 'Analyze this image in detail. Describe all visible elements, scenery, any readable text, and key takeaways.';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${orCfg.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://hind.com',
          'X-Title': 'Hind Search Engine'
        },
        body: JSON.stringify({
          model: visionModelId,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: question },
                { type: 'image_url', image_url: { url: parsed.dataUrl } }
              ]
            }
          ]
        })
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
          analysisResult = data.choices[0].message.content;
          modelUsed = 'Cyan Hind Vision (Llama 3.2 Vision)';
        }
      }
    } catch (e) {
      console.warn('Vision API error, falling back to cushioning:', e);
    } finally {
      clearTimeout(timeout);
    }

    if (!analysisResult) {
      const fallbackPrompt = `The user uploaded an image named "${parsed.fileName}" (${Math.round(parsed.fileSize / 1024)} KB, ${parsed.fileExt.toUpperCase()}). The user asks: "${question}". Provide a helpful, intelligent analysis and answer their query.`;
      const res = await requestShrishtiAiWithCushion(fallbackPrompt, primaryModelKey);
      analysisResult = res.content;
      modelUsed = res.modelUsed;
    }
  } else {
    // Text / Document / PDF
    if (typeof onProgress === 'function') onProgress('Analyzing document with Shrishti AI...');
    const maxChars = 7500;
    const truncatedText = (parsed.text || '').slice(0, maxChars);
    const wasTruncated = (parsed.text || '').length > maxChars;

    const question = userPrompt.trim() || 'Please summarize this document, explain its main points, key data, and provide an analytical breakdown.';
    const prompt = `You are Shrishti AI, an expert document analyst for Hind.com.
The user uploaded a document named "${parsed.fileName}" (${Math.round(parsed.fileSize / 1024)} KB, ${parsed.fileExt.toUpperCase()}).

--- DOCUMENT CONTENT BEGIN ---
${truncatedText}${wasTruncated ? '\n...[Document excerpt truncated to fit context limits]...' : ''}
--- DOCUMENT CONTENT END ---

User Request / Question:
${question}

Please provide a clear, well-structured, and comprehensive summary & analysis.`;

    const res = await requestShrishtiAiWithCushion(prompt, primaryModelKey);
    analysisResult = res.content;
    modelUsed = res.modelUsed;
  }

  // Deduct 5 credits
  spendProCredits(SHRISHTI_CONFIG.CREDIT_COSTS.FILE_ANALYSIS);

  return {
    content: analysisResult,
    modelUsed: modelUsed,
    fileName: parsed.fileName,
    fileType: parsed.type,
    fileExt: parsed.fileExt,
    dataUrl: parsed.dataUrl || null,
    creditsUsed: SHRISHTI_CONFIG.CREDIT_COSTS.FILE_ANALYSIS,
    creditsRemaining: getShrishtiRemainingProCredits()
  };
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
  window.generateShrishtiImage = generateShrishtiImage;
  window.parseUploadedFileContent = parseUploadedFileContent;
  window.analyzeShrishtiFile = analyzeShrishtiFile;
  window.getShrishtiProCredits = getShrishtiProCredits;
  window.getShrishtiRemainingProCredits = getShrishtiRemainingProCredits;
  window.canSpendProCredits = canSpendProCredits;
  window.spendProCredits = spendProCredits;
  window.requestShrishtiAiWithCushion = requestShrishtiAiWithCushion;
  window.canAskShrishti = canAskShrishti;
  window.incrementShrishtiQuota = incrementShrishtiQuota;
  window.getShrishtiRemainingQuestions = getShrishtiRemainingQuestions;
  window.updateShrishtiQuotaBadges = updateShrishtiQuotaBadges;
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


