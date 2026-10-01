/**
 * Hind Optional Full-Site Translation Module (powered by Google Translate API & MyMemory Fallback)
 * Allows visitors to manually choose their preferred language instead of forcing auto-translation.
 */
(function () {
  'use strict';

  const LANG_OPTIONS = [
    { code: 'en', name: 'English', native: 'Original (English)' },
    { code: 'hi', name: 'Hindi', native: 'हिंदी' },
    { code: 'bn', name: 'Bengali', native: 'বাংলা' },
    { code: 'te', name: 'Telugu', native: 'తెలుగు' },
    { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
    { code: 'mr', name: 'Marathi', native: 'मराठी' },
    { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી' },
    { code: 'ur', name: 'Urdu', native: 'اردو' },
    { code: 'es', name: 'Spanish', native: 'Español' },
    { code: 'fr', name: 'French', native: 'Français' },
    { code: 'de', name: 'German', native: 'Deutsch' },
    { code: 'ja', name: 'Japanese', native: '日本語' },
    { code: 'zh', name: 'Chinese', native: '中文' },
    { code: 'ar', name: 'Arabic', native: 'العربية' },
    { code: 'ru', name: 'Russian', native: 'Русский' },
  ];

  const HIST_KEY = 'hind_user_lang';
  const DONE_KEY = 'hind_translated_' + location.pathname;

  // Google Translate API (primary) with MyMemory API fallback
  async function fetchTranslation(text, targetLang) {
    if (!text || !text.trim() || text.trim().length < 2) return text;
    const cleanText = text.trim();

    // 1. Try Google Translate API (fast & free unlimited endpoint)
    try {
      const gUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(cleanText)}`;
      const res = await fetch(gUrl);
      if (res.ok) {
        const data = await res.json();
        if (data && data[0]) {
          const translated = data[0].map(x => x[0]).filter(Boolean).join('');
          if (translated && translated !== cleanText) return translated;
        }
      }
    } catch (_) {}

    // 2. Fallback to MyMemory API if Google fails
    try {
      const mUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleanText)}&langpair=en|${targetLang}`;
      const res = await fetch(mUrl);
      if (res.ok) {
        const data = await res.json();
        if (data && data.responseData && data.responseData.translatedText) {
          return data.responseData.translatedText;
        }
      }
    } catch (_) {}

    return text;
  }

  // Collect translatable text nodes
  function getTextNodes(root) {
    const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'CODE', 'PRE', 'KBD', 'SAMP']);
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
          if (skip.has(node.parentElement && node.parentElement.tagName)) return NodeFilter.FILTER_REJECT;
          if (node.parentElement && node.parentElement.closest('#hind_lang_widget')) return NodeFilter.FILTER_REJECT;
          if (node.parentElement && node.parentElement.dataset.hindTranslated) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  // Batch translate page text
  async function translatePage(lang) {
    if (lang === 'en') return;
    if (sessionStorage.getItem(DONE_KEY)) return;

    const nodes = getTextNodes(document.body);
    if (!nodes.length) return;

    const BATCH_SIZE = 6;
    for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
      const batch = nodes.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (node) => {
        const original = node.textContent.trim();
        if (!original || original.length < 2) return;
        try {
          const translated = await fetchTranslation(original, lang);
          if (translated && translated !== original) {
            node.textContent = node.textContent.replace(original, translated);
            if (node.parentElement) node.parentElement.dataset.hindTranslated = '1';
          }
        } catch (_) {}
      }));
      await new Promise(r => setTimeout(r, 40));
    }

    // Translate placeholder attributes
    document.querySelectorAll('[placeholder]').forEach(async el => {
      if (el.closest('#hind_lang_widget')) return;
      const orig = el.getAttribute('placeholder');
      if (!orig || orig.length < 3) return;
      try {
        const t = await fetchTranslation(orig, lang);
        if (t) el.setAttribute('placeholder', t);
      } catch (_) {}
    });

    sessionStorage.setItem(DONE_KEY, '1');
  }

  // Render Language Picker Widget
  function createLanguageWidget() {
    if (document.getElementById('hind_lang_widget')) return;

    const currentLang = localStorage.getItem(HIST_KEY) || 'en';
    const activeOpt = LANG_OPTIONS.find(o => o.code === currentLang) || LANG_OPTIONS[0];

    const container = document.createElement('div');
    container.id = 'hind_lang_widget';
    container.style.cssText = [
      'position: fixed',
      'bottom: 1rem',
      'left: 1rem',
      'z-index: 99999',
      'font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    ].join(';');

    // Button Pill
    const pill = document.createElement('button');
    pill.id = 'hind_lang_pill';
    pill.type = 'button';
    pill.innerHTML = `<span style="font-size: 0.95rem;">🌐</span> <span>${activeOpt.native}</span> <span style="font-size:0.7rem; opacity:0.8;">▲</span>`;
    pill.style.cssText = [
      'display: flex',
      'align-items: center',
      'gap: 6px',
      'background: rgba(15, 23, 42, 0.92)',
      'backdrop-filter: blur(10px)',
      'color: #ffffff',
      'border: 1px solid rgba(255, 255, 255, 0.2)',
      'border-radius: 20px',
      'padding: 0.42rem 0.95rem',
      'font-size: 0.81rem',
      'font-weight: 600',
      'cursor: pointer',
      'box-shadow: 0 4px 18px rgba(0,0,0,0.3)',
      'transition: all 0.2s ease',
      'outline: none'
    ].join(';');

    // Popup Menu
    const menu = document.createElement('div');
    menu.id = 'hind_lang_menu';
    menu.style.cssText = [
      'display: none',
      'position: absolute',
      'bottom: 2.8rem',
      'left: 0',
      'width: 240px',
      'max-height: 320px',
      'overflow-y: auto',
      'background: #0f172a',
      'border: 1px solid rgba(255, 255, 255, 0.15)',
      'border-radius: 14px',
      'padding: 0.5rem',
      'box-shadow: 0 10px 30px rgba(0,0,0,0.45)',
      'color: #f8fafc'
    ].join(';');

    const header = document.createElement('div');
    header.style.cssText = 'padding: 0.4rem 0.6rem; font-size: 0.75rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 0.4rem;';
    header.textContent = 'Choose Language / भाषा चुनें';
    menu.appendChild(header);

    LANG_OPTIONS.forEach(opt => {
      const item = document.createElement('div');
      item.className = 'hind-lang-item';
      const isSelected = opt.code === currentLang;
      item.style.cssText = [
        'display: flex',
        'align-items: center',
        'justify-content: space-between',
        'padding: 0.45rem 0.65rem',
        'border-radius: 8px',
        'font-size: 0.84rem',
        'cursor: pointer',
        'transition: background 0.15s',
        isSelected ? 'background: rgba(37, 99, 235, 0.3); font-weight: 700; color: #60a5fa;' : 'color: #e2e8f0;'
      ].join(';');
      item.innerHTML = `<span>${opt.native} <small style="opacity:0.6; font-size:0.75rem;">(${opt.name})</small></span> ${isSelected ? '✓' : ''}`;

      item.addEventListener('mouseenter', () => { if (!isSelected) item.style.background = 'rgba(255,255,255,0.08)'; });
      item.addEventListener('mouseleave', () => { if (!isSelected) item.style.background = 'transparent'; });

      item.addEventListener('click', () => {
        if (opt.code === 'en') {
          localStorage.removeItem(HIST_KEY);
          sessionStorage.removeItem(DONE_KEY);
        } else {
          localStorage.setItem(HIST_KEY, opt.code);
          sessionStorage.removeItem(DONE_KEY);
        }
        location.reload();
      });

      menu.appendChild(item);
    });

    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = menu.style.display === 'block';
      menu.style.display = isVisible ? 'none' : 'block';
    });

    document.addEventListener('click', (e) => {
      if (!container.contains(e.target)) {
        menu.style.display = 'none';
      }
    });

    container.appendChild(menu);
    container.appendChild(pill);
    document.body.appendChild(container);
  }

  async function init() {
    createLanguageWidget();
    const savedLang = localStorage.getItem(HIST_KEY);
    // Only translate if user explicitly selected a non-English language
    if (savedLang && savedLang !== 'en') {
      await new Promise(r => setTimeout(r, 200));
      await translatePage(savedLang);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.hindLangReset = function () {
    localStorage.removeItem(HIST_KEY);
    sessionStorage.removeItem(DONE_KEY);
    location.reload();
  };
})();
