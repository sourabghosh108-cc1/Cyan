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
  const timeoutId = setTimeout(() => controller.abort(), 35000);
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
  const timeoutId = setTimeout(() => controller.abort(), 35000);
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
  const timeoutId = setTimeout(() => controller.abort(), 35000);
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
  const timeoutId = setTimeout(() => controller.abort(), 35000);
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

// ── Document & Transcript Extraction Engine (DOCX, PDF, Transcripts) ──
async function parseUploadedFileContent(file) {
  const fileName = file.name || 'uploaded_document';
  const fileExt = fileName.split('.').pop().toLowerCase();

  // Validate allowed extensions: only PDF, DOCX, DOC, and transcript text formats
  const allowedExts = ['pdf', 'docx', 'doc', 'txt', 'vtt', 'srt'];
  if (!allowedExts.includes(fileExt)) {
    throw new Error(`File format ".${fileExt}" is not supported. Please upload a PDF (.pdf), Word Document (.docx), or Transcript (.txt, .vtt, .srt).`);
  }

  // 1. Word Document (.docx, .doc) via Mammoth.js
  if (fileExt === 'docx' || fileExt === 'doc') {
    return new Promise(async (resolve, reject) => {
      try {
        const arrayBuffer = await file.arrayBuffer();

        // Dynamically load Mammoth.js if not already present
        if (typeof window.mammoth === 'undefined') {
          await new Promise((res, rej) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
            script.onload = res;
            script.onerror = rej;
            document.head.appendChild(script);
          });
        }

        if (window.mammoth) {
          const result = await window.mammoth.extractRawText({ arrayBuffer: arrayBuffer });
          const extracted = (result && result.value) ? result.value.trim() : '';
          if (extracted) {
            return resolve({
              type: 'docx',
              formatName: 'Word Document',
              fileName,
              fileExt,
              fileSize: file.size,
              text: extracted
            });
          }
        }

        // Fallback text extraction for raw text tokens
        const uint8 = new Uint8Array(arrayBuffer);
        const raw = new TextDecoder('utf-8', { fatal: false }).decode(uint8);
        const clean = raw.replace(/[^\x20-\x7E\t\n\r]/g, ' ').replace(/\s{2,}/g, ' ').trim();
        resolve({
          type: 'docx',
          formatName: 'Word Document',
          fileName,
          fileExt,
          fileSize: file.size,
          text: clean.slice(0, 5000) || 'Could not extract raw text from document.'
        });
      } catch (err) {
        reject(new Error('Failed to parse Word Document: ' + err.message));
      }
    });
  }

  // 2. PDF Files (.pdf) via PDF.js
  if (fileExt === 'pdf') {
    return new Promise(async (resolve, reject) => {
      try {
        const arrayBuffer = await file.arrayBuffer();

        // Dynamically load PDF.js if not already present
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
          const numPages = Math.min(pdf.numPages, 15);
          for (let i = 1; i <= numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            if (pageText.trim()) fullText += `[Page ${i}]\n${pageText}\n\n`;
          }
        }

        if (!fullText.trim()) {
          const uint8 = new Uint8Array(arrayBuffer);
          const raw = new TextDecoder('latin1').decode(uint8);
          const matches = raw.match(/\(([^()]{3,})\)Tj/g) || [];
          fullText = matches.map(m => m.slice(1, -3)).join(' ');
        }

        resolve({
          type: 'pdf',
          formatName: 'PDF Document',
          fileName,
          fileExt: 'pdf',
          fileSize: file.size,
          text: fullText.trim() || 'Could not extract readable text from PDF (it may be scanned/image-only).'
        });
      } catch (err) {
        reject(new Error('Could not read PDF: ' + err.message));
      }
    });
  }

  // 3. Transcript Files (.txt, .vtt, .srt)
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      let rawText = e.target.result || '';

      // If subtitle/vtt transcript, strip cues and timestamps for pure spoken text
      if (fileExt === 'vtt' || fileExt === 'srt') {
        rawText = rawText
          .replace(/^WEBVTT.*$/gm, '')
          .replace(/^\d+\s*$/gm, '')
          .replace(/\d{1,2}:\d{2}(:\d{2})?([.,]\d+)?\s*-->\s*\d{1,2}:\d{2}(:\d{2})?([.,]\d+)?.*$/gm, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      }

      resolve({
        type: 'transcript',
        formatName: (fileExt === 'vtt' || fileExt === 'srt') ? 'Subtitle/Meeting Transcript' : 'Text / Transcript',
        fileName,
        fileExt,
        fileSize: file.size,
        text: rawText.trim()
      });
    };
    reader.onerror = () => reject(new Error('Failed to read transcript file.'));
    reader.readAsText(file);
  });
}

// ── Document & Transcript Summary Generator (5 credits per summary, 2 per day) ──
async function analyzeShrishtiFile(file, userPrompt = '', primaryModelKey = 'lemon-pineapple-a', onProgress = null) {
  if (!file) throw new Error('No document or transcript provided.');

  if (!canSpendProCredits(SHRISHTI_CONFIG.CREDIT_COSTS.FILE_ANALYSIS)) {
    const rem = getShrishtiRemainingProCredits();
    throw new Error(`Insufficient Pro Credits. Generating a document/transcript summary requires 5 credits (you have ${rem}/${SHRISHTI_CONFIG.PRO_CREDITS_DAILY_LIMIT} left today). Credits reset daily.`);
  }

  if (typeof onProgress === 'function') onProgress('Reading and extracting text from document...');
  const parsed = await parseUploadedFileContent(file);

  if (!parsed.text || !parsed.text.trim()) {
    throw new Error(`The uploaded file "${parsed.fileName}" appears to be empty or has no readable text.`);
  }

  if (typeof onProgress === 'function') onProgress(`Generating structured ${parsed.formatName} summary with Shrishti AI...`);

  // Restrict context excerpt to ~4000 characters to keep requests light, fast, and reliable
  const maxChars = 4000;
  const cleanContent = parsed.text.trim();
  const truncatedText = cleanContent.slice(0, maxChars);
  const wasTruncated = cleanContent.length > maxChars;

  const userInstruction = (userPrompt || '').trim() || 'Provide a comprehensive executive summary, core discussion points, action items, and key takeaways.';

  const prompt = `You are Shrishti AI, a concise and highly organized document and transcript summarizer for Hind.com.
File: "${parsed.fileName}" (${parsed.formatName})

--- DOCUMENT / TRANSCRIPT CONTENT BEGIN ---
${truncatedText}${wasTruncated ? '\n...[Content condensed to fit context window]...' : ''}
--- DOCUMENT / TRANSCRIPT CONTENT END ---

User Request:
${userInstruction}

Please format your response clearly with these specific sections:
1. 📌 **Executive Overview** (2-3 concise sentences summarizing the essence)
2. 🔑 **Key Discussion Points & Findings** (concise bullet points)
3. 📋 **Action Items, Decisions & Takeaways** (clear actionable conclusions or next steps)
4. 💡 **Important Quotes or Data Highlights** (notable metrics, statements, or conclusions)`;

  const res = await requestShrishtiAiWithCushion(prompt, primaryModelKey);

  // Deduct 5 credits upon successful completion
  spendProCredits(SHRISHTI_CONFIG.CREDIT_COSTS.FILE_ANALYSIS);

  return {
    content: res.content,
    modelUsed: res.modelUsed,
    fileName: parsed.fileName,
    fileType: parsed.type,
    fileExt: parsed.fileExt,
    formatName: parsed.formatName,
    creditsUsed: SHRISHTI_CONFIG.CREDIT_COSTS.FILE_ANALYSIS,
    creditsRemaining: getShrishtiRemainingProCredits()
  };
}

// ── Speech Synthesis (Text-to-Speech) & Speech Recognition (Voice Input) ──
let _currentSpeakingBtn = null;

function stopShrishtiSpeech() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  if (_currentSpeakingBtn) {
    const icon = _currentSpeakingBtn.querySelector('i');
    if (icon) icon.className = 'fa-solid fa-volume-high';
    const textSpan = _currentSpeakingBtn.querySelector('span');
    if (textSpan && textSpan.textContent.includes('Stop')) textSpan.textContent = 'Listen';
    _currentSpeakingBtn.classList.remove('speaking');
    _currentSpeakingBtn = null;
  }
}

function speakShrishtiText(text, buttonEl) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    alert('Text-to-speech is not supported in this browser.');
    return;
  }

  // If already speaking from this button, toggle off
  if (window.speechSynthesis.speaking && _currentSpeakingBtn === buttonEl) {
    stopShrishtiSpeech();
    return;
  }

  // Stop any other active speech
  stopShrishtiSpeech();

  const cleanText = (text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[*#_~`]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!cleanText) return;

  const utterance = new SpeechSynthesisUtterance(cleanText);
  // Detect Hindi vs English
  const isHindi = /[\u0900-\u097F]/.test(cleanText);
  utterance.lang = isHindi ? 'hi-IN' : 'en-US';
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  if (buttonEl) {
    _currentSpeakingBtn = buttonEl;
    const icon = buttonEl.querySelector('i');
    if (icon) icon.className = 'fa-solid fa-circle-stop';
    const textSpan = buttonEl.querySelector('span');
    if (textSpan && textSpan.textContent.includes('Listen')) textSpan.textContent = 'Stop';
    buttonEl.classList.add('speaking');

    utterance.onend = () => {
      stopShrishtiSpeech();
    };
    utterance.onerror = () => {
      stopShrishtiSpeech();
    };
  }

  window.speechSynthesis.speak(utterance);
}

function toggleSpeakAiMessage(buttonEl) {
  if (!buttonEl) return;
  if (window.speechSynthesis && window.speechSynthesis.speaking && _currentSpeakingBtn === buttonEl) {
    stopShrishtiSpeech();
    return;
  }

  const container = buttonEl.closest('.ai-msg, .msg-bubble, .ai-answer-card');
  if (!container) return;

  const clone = container.cloneNode(true);
  clone.querySelectorAll('.ai-speak-btn, .ai-msg-speak-btn, .shrishti-model-bar, button, script').forEach(el => el.remove());
  const rawText = clone.innerText || clone.textContent || '';
  speakShrishtiText(rawText, buttonEl);
}

function initShrishtiVoiceInput(micBtn, inputEl, onComplete) {
  if (!micBtn || !inputEl) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    micBtn.style.display = 'none';
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'en-IN';
  recognition.continuous = false;
  recognition.interimResults = true;

  let listening = false;
  const icon = micBtn.querySelector('i');

  micBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (listening) {
      recognition.stop();
      return;
    }
    try {
      recognition.start();
    } catch (err) {
      console.warn('SpeechRecognition start error:', err);
    }
  });

  recognition.onstart = () => {
    listening = true;
    micBtn.classList.add('listening');
    if (icon) icon.className = 'fa-solid fa-microphone-lines';
    micBtn.title = 'Listening... click to stop';
    inputEl.placeholder = 'Listening... speak now!';
  };

  recognition.onresult = (event) => {
    let finalTranscript = '';
    let interimTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }
    if (finalTranscript) {
      inputEl.value = (inputEl.value ? inputEl.value + ' ' : '') + finalTranscript.trim();
    } else if (interimTranscript && !inputEl.value) {
      inputEl.placeholder = interimTranscript;
    }
  };

  recognition.onerror = (event) => {
    console.warn('Speech recognition error:', event.error);
    listening = false;
    micBtn.classList.remove('listening');
    if (icon) icon.className = 'fa-solid fa-microphone';
    micBtn.title = 'Voice Input';
  };

  recognition.onend = () => {
    listening = false;
    micBtn.classList.remove('listening');
    if (icon) icon.className = 'fa-solid fa-microphone';
    micBtn.title = 'Voice Input';
    inputEl.placeholder = 'Ask Shrishti, or type /image...';
    inputEl.focus();
    if (typeof onComplete === 'function' && inputEl.value.trim()) {
      onComplete(inputEl.value.trim());
    }
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
  window.speakShrishtiText = speakShrishtiText;
  window.stopShrishtiSpeech = stopShrishtiSpeech;
  window.toggleSpeakAiMessage = toggleSpeakAiMessage;
  window.initShrishtiVoiceInput = initShrishtiVoiceInput;
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


