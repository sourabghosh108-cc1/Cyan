/**
 * Hind Auto-Translate (powered by Cyan Translate / MyMemory API)
 * Detects visitor country from IP → maps to language → translates all text nodes via MyMemory API
 * Stores result in localStorage so IP is only called once ever.
 */
(function () {
  'use strict';

  // Country code → ISO 639-1 language code (matches MyMemory format)
  const COUNTRY_LANG = {
    // South Asia
    IN: 'hi', PK: 'ur', BD: 'bn', LK: 'si', NP: 'ne',
    // East Asia
    CN: 'zh', TW: 'zh', JP: 'ja', KR: 'ko', HK: 'zh', MO: 'zh',
    // South-East Asia
    ID: 'id', MY: 'ms', TH: 'th', VN: 'vi', PH: 'tl', MM: 'my', KH: 'km',
    SG: 'ms',
    // Middle East / Arab world
    SA: 'ar', AE: 'ar', EG: 'ar', IQ: 'ar', JO: 'ar', KW: 'ar', LB: 'ar',
    LY: 'ar', MA: 'ar', OM: 'ar', QA: 'ar', SY: 'ar', TN: 'ar', YE: 'ar',
    IL: 'iw', TR: 'tr', IR: 'fa',
    // Europe
    RU: 'ru', UA: 'uk', PL: 'pl', DE: 'de', FR: 'fr', IT: 'it', ES: 'es',
    PT: 'pt', NL: 'nl', GR: 'el', RO: 'ro', CZ: 'cs', SK: 'sk',
    HU: 'hu', BG: 'bg', HR: 'hr', RS: 'sr', FI: 'fi', SE: 'sv',
    NO: 'no', DK: 'da', AT: 'de', CH: 'de',
    // Americas
    BR: 'pt', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', VE: 'es',
    // Africa
    NG: 'yo', KE: 'sw', TZ: 'sw', ET: 'am',
    // English countries — skip translation
    US: 'en', GB: 'en', AU: 'en', CA: 'en', NZ: 'en', IE: 'en',
  };

  const LANG_NAMES = {
    hi:'हिंदी', ur:'اردو', bn:'বাংলা', si:'සිංහල', ne:'नेपाली',
    zh:'中文', ja:'日本語', ko:'한국어',
    id:'Bahasa', ms:'Melayu', th:'ไทย', vi:'Tiếng Việt', tl:'Filipino',
    ar:'العربية', tr:'Türkçe', fa:'فارسی', iw:'עברית',
    ru:'Русский', uk:'Українська', pl:'Polski', de:'Deutsch', fr:'Français',
    it:'Italiano', es:'Español', pt:'Português', nl:'Nederlands',
    el:'Ελληνικά', ro:'Română', cs:'Čeština', hu:'Magyar', sv:'Svenska',
    fi:'Suomi', no:'Norsk', da:'Dansk', bg:'Български', hr:'Hrvatski',
    sr:'Srpski', yo:'Yorùbá', sw:'Kiswahili', am:'አማርኛ',
  };

  const HIST_KEY    = 'hind_user_lang';
  const COUNTRY_KEY = 'hind_user_country';
  const DONE_KEY    = 'hind_translated_' + location.pathname;

  // MyMemory translate API (same as Cyan Translate app)
  async function myMemoryTranslate(text, targetLang) {
    if (!text || !text.trim() || text.trim().length < 2) return text;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.trim())}&langpair=en|${targetLang}`;
    const res  = await fetch(url);
    const data = await res.json();
    return (data.responseData && data.responseData.translatedText) || text;
  }

  // Collect translatable text nodes (skip scripts, styles, inputs)
  function getTextNodes(root) {
    const skip = new Set(['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','INPUT','SELECT','CODE','PRE','KBD','SAMP']);
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
          if (skip.has(node.parentElement && node.parentElement.tagName)) return NodeFilter.FILTER_REJECT;
          // Skip things already marked as translated
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

  // Batch translate all visible text on page (chunked to respect rate limits)
  async function translatePage(lang) {
    if (sessionStorage.getItem(DONE_KEY)) return; // already done this session

    const nodes = getTextNodes(document.body);
    if (!nodes.length) return;

    // Process in small batches to avoid rate-limiting (MyMemory free = ~1000 chars/req)
    const BATCH_SIZE = 5;
    for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
      const batch = nodes.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (node) => {
        const original = node.textContent.trim();
        if (!original || original.length < 3) return;
        try {
          const translated = await myMemoryTranslate(original, lang);
          if (translated && translated !== original) {
            node.textContent = node.textContent.replace(original, translated);
            if (node.parentElement) node.parentElement.dataset.hindTranslated = '1';
          }
        } catch (_) { /* silently ignore per-node errors */ }
      }));
      // Small delay between batches to be kind to the free API
      await new Promise(r => setTimeout(r, 80));
    }

    // Also translate placeholder attributes
    document.querySelectorAll('[placeholder]').forEach(async el => {
      const orig = el.getAttribute('placeholder');
      if (!orig || orig.length < 3) return;
      try {
        const t = await myMemoryTranslate(orig, lang);
        if (t) el.setAttribute('placeholder', t);
      } catch (_) {}
    });

    sessionStorage.setItem(DONE_KEY, '1');
  }

  // Show a subtle pill in bottom-left
  function showPill(lang) {
    if (document.getElementById('hind_lang_pill')) return;
    const label = LANG_NAMES[lang] || lang.toUpperCase();
    const pill = document.createElement('div');
    pill.id = 'hind_lang_pill';
    pill.title = 'Page auto-translated by Cyan Translate. Click to reset.';
    pill.innerHTML = `<span>🌐</span> <span>${label}</span>`;
    pill.style.cssText = [
      'position:fixed', 'bottom:1rem', 'left:1rem', 'z-index:99999',
      'display:flex', 'align-items:center', 'gap:5px',
      'background:rgba(8,145,178,0.9)', 'backdrop-filter:blur(8px)',
      'color:#ffffff', 'border:1px solid rgba(255,255,255,0.2)',
      'border-radius:20px', 'padding:0.3rem 0.8rem',
      'font-size:0.78rem', 'font-weight:700', 'cursor:pointer',
      'box-shadow:0 4px 16px rgba(8,145,178,0.35)',
      'font-family:inherit', 'user-select:none',
      'transition:opacity 0.2s',
    ].join(';');
    pill.addEventListener('click', () => {
      localStorage.removeItem(HIST_KEY);
      localStorage.removeItem(COUNTRY_KEY);
      sessionStorage.removeItem(DONE_KEY);
      location.reload();
    });
    document.body.appendChild(pill);
  }

  async function detectCountry() {
    if (localStorage.getItem(HIST_KEY)) return;
    try {
      const res  = await fetch('https://ipapi.co/json/');
      const data = await res.json();
      const cc   = (data.country_code || 'US').toUpperCase();
      localStorage.setItem(COUNTRY_KEY, cc);
      const lang = COUNTRY_LANG[cc] || 'en';
      localStorage.setItem(HIST_KEY, lang);
    } catch (_) {
      localStorage.setItem(HIST_KEY, 'en');
    }
  }

  async function init() {
    await detectCountry();
    const lang = localStorage.getItem(HIST_KEY) || 'en';
    if (lang === 'en') return; // English — nothing to do

    showPill(lang);
    // Wait for DOM to fully settle then translate
    await new Promise(r => setTimeout(r, 400));
    await translatePage(lang);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Dev reset helper
  window.hindLangReset = function () {
    localStorage.removeItem(HIST_KEY);
    localStorage.removeItem(COUNTRY_KEY);
    location.reload();
  };
})();
