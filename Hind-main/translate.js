/**
 * Hind Auto-Translate
 * Detects visitor country from IP → maps to language → auto-triggers Google Translate
 * Stored in localStorage so it only runs the IP lookup once per session.
 */
(function () {
  'use strict';

  // Country code → Google Translate language code
  const COUNTRY_LANG = {
    // South Asia
    IN: 'hi', PK: 'ur', BD: 'bn', LK: 'si', NP: 'ne', BT: 'dz', MV: 'en',
    // East Asia
    CN: 'zh-CN', TW: 'zh-TW', JP: 'ja', KR: 'ko', HK: 'zh-TW', MO: 'zh-TW',
    // South-East Asia
    ID: 'id', MY: 'ms', TH: 'th', VN: 'vi', PH: 'tl', MM: 'my', KH: 'km',
    LA: 'lo', SG: 'ms', BN: 'ms',
    // Middle East / Arab world
    SA: 'ar', AE: 'ar', EG: 'ar', IQ: 'ar', JO: 'ar', KW: 'ar', LB: 'ar',
    LY: 'ar', MA: 'ar', OM: 'ar', QA: 'ar', SY: 'ar', TN: 'ar', YE: 'ar',
    IL: 'iw', TR: 'tr', IR: 'fa', AF: 'ps',
    // Europe
    RU: 'ru', UA: 'uk', PL: 'pl', DE: 'de', FR: 'fr', IT: 'it', ES: 'es',
    PT: 'pt', NL: 'nl', BE: 'nl', GR: 'el', RO: 'ro', CZ: 'cs', SK: 'sk',
    HU: 'hu', BG: 'bg', HR: 'hr', RS: 'sr', SI: 'sl', FI: 'fi', SE: 'sv',
    NO: 'no', DK: 'da', AT: 'de', CH: 'de',
    // Americas
    BR: 'pt', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', VE: 'es',
    EC: 'es', BO: 'es', PY: 'es', UY: 'es',
    // Africa
    NG: 'yo', ZA: 'zu', KE: 'sw', TZ: 'sw', ET: 'am', GH: 'en', CI: 'fr',
    CM: 'fr', SN: 'fr', ML: 'fr', BJ: 'fr', TG: 'fr', GA: 'fr', MG: 'mg',
    // English-default countries (no translation needed)
    US: 'en', GB: 'en', AU: 'en', CA: 'en', NZ: 'en', IE: 'en', ZW: 'en',
  };

  const STORAGE_KEY  = 'hind_user_lang';
  const COUNTRY_KEY  = 'hind_user_country';
  const SKIP_LANGS   = ['en']; // Don't translate if user is already English

  // Called by Google Translate widget loader
  window.googleTranslateElementInit = function () {
    new google.translate.TranslateElement(
      { pageLanguage: 'en', autoDisplay: false },
      'hind_translate_root'
    );
    // After widget is ready, apply language
    setTimeout(applyLang, 600);
  };

  function applyLang() {
    const lang = localStorage.getItem(STORAGE_KEY);
    if (!lang || SKIP_LANGS.includes(lang)) return;
    const sel = document.querySelector('.goog-te-combo');
    if (!sel) return;
    sel.value = lang;
    sel.dispatchEvent(new Event('change'));
    updatePill(lang);
  }

  function updatePill(lang) {
    const pill = document.getElementById('hind_lang_pill');
    if (!pill) return;
    const label = langLabel(lang);
    pill.innerHTML = `<span style="opacity:.6;font-size:.7rem;">🌐</span> ${label} <span style="opacity:.5;font-size:.7rem;margin-left:2px;">▾</span>`;
    pill.style.display = 'flex';
  }

  function langLabel(code) {
    const map = {
      hi:'हिंदी', ur:'اردو', bn:'বাংলা', si:'සිංහල', ne:'नेपाली',
      'zh-CN':'中文', 'zh-TW':'繁體', ja:'日本語', ko:'한국어',
      id:'Bahasa', ms:'Melayu', th:'ไทย', vi:'Tiếng Việt', tl:'Filipino',
      ar:'العربية', tr:'Türkçe', fa:'فارسی', ps:'پښتو',
      ru:'Русский', uk:'Українська', pl:'Polski', de:'Deutsch', fr:'Français',
      it:'Italiano', es:'Español', pt:'Português', nl:'Nederlands',
      el:'Ελληνικά', ro:'Română', cs:'Čeština', hu:'Magyar', sv:'Svenska',
      fi:'Suomi', no:'Norsk', da:'Dansk', bg:'Български', hr:'Hrvatski',
      sr:'Srpski', iw:'עברית',
      yo:'Yorùbá', sw:'Kiswahili', am:'አማርኛ', zu:'Zulu', mg:'Malagasy',
    };
    return map[code] || code.toUpperCase();
  }

  async function detectAndStore() {
    // Already have a stored preference?
    if (localStorage.getItem(STORAGE_KEY)) return;

    try {
      const res  = await fetch('https://ipapi.co/json/');
      const data = await res.json();
      const cc   = (data.country_code || '').toUpperCase();
      localStorage.setItem(COUNTRY_KEY, cc);
      const lang = COUNTRY_LANG[cc] || 'en';
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (_) {
      localStorage.setItem(STORAGE_KEY, 'en');
    }
  }

  // Inject the hidden translate widget root
  function injectRoot() {
    if (document.getElementById('hind_translate_root')) return;
    const root = document.createElement('div');
    root.id = 'hind_translate_root';
    root.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;';
    document.body.appendChild(root);
  }

  // Inject language pill (bottom-left floating chip)
  function injectPill() {
    if (document.getElementById('hind_lang_pill')) return;
    const pill = document.createElement('button');
    pill.id = 'hind_lang_pill';
    pill.title = 'Change language';
    pill.setAttribute('aria-label', 'Change language');
    pill.style.cssText = [
      'position:fixed', 'bottom:1rem', 'left:1rem', 'z-index:99999',
      'display:none', 'align-items:center', 'gap:4px',
      'background:rgba(30,41,59,0.88)', 'backdrop-filter:blur(8px)',
      'color:#f1f5f9', 'border:1px solid rgba(255,255,255,0.12)',
      'border-radius:20px', 'padding:0.3rem 0.75rem',
      'font-size:0.8rem', 'font-weight:600', 'cursor:pointer',
      'box-shadow:0 4px 16px rgba(0,0,0,0.25)',
      'font-family:inherit', 'transition:opacity 0.2s',
    ].join(';');
    pill.addEventListener('click', () => {
      // Show the Google Translate widget temporarily
      const sel = document.querySelector('.goog-te-combo');
      if (sel) { sel.style.cssText = 'position:fixed;bottom:3rem;left:1rem;z-index:99999;font-size:0.85rem;padding:4px 8px;border-radius:6px;'; sel.focus(); }
    });
    document.body.appendChild(pill);
  }

  // Load Google Translate script
  function loadGT() {
    if (document.getElementById('hind_gt_script')) return;
    const s = document.createElement('script');
    s.id  = 'hind_gt_script';
    s.src = '//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    s.async = true;
    document.head.appendChild(s);
  }

  // Main init
  async function init() {
    await detectAndStore();
    const lang = localStorage.getItem(STORAGE_KEY) || 'en';
    if (SKIP_LANGS.includes(lang)) return; // English — no translation needed
    injectRoot();
    injectPill();
    loadGT();
    updatePill(lang);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose reset function for dev/debug
  window.hindLangReset = function () {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(COUNTRY_KEY);
    location.reload();
  };
})();
