import STYLES from './repodeck.css';

/**
 * repodeck — <repo-deck> Custom Element
 *
 * Turns a GitHub repository (that ships a `config-repodeck/` folder) into an
 * embeddable card with an expandable modal. Works in any stack (HTML, Vue,
 * Svelte, Angular, React) with zero adapter.
 *
 * Attributes (see plan §6):
 *   owner            (required) GitHub owner
 *   repo             (required) GitHub repo
 *   branch           (default "main")
 *   preset           (default "standard")  minimal | standard | detailed
 *   config-path      (default "config-repodeck")
 *   theme            (default "auto")      light | dark | auto
 *   modal-sections   (default "readme,screenshots,link")  ordered, comma list
 *   radius           (default "soft")      sharp | soft | round | <css length>
 *   data-url         (default "/api/repodeck/data")  endpoint serving CardData
 *   hide-branding    (optional flag)  hides the small "powered by repodeck" link
 *   debug            (optional flag)  verbose console logging
 *
 * Events: repodeck:loaded, repodeck:error, repodeck:modal-open, repodeck:modal-close
 *
 * Public methods: openModal(), closeModal()
 * Public API:    window.RepoDeck.setLocale, .createAnalyticsAdapter, .t
 */

// --- types (mirrors @repodeck/core for self-containment) -------------------

interface Screenshot {
  url: string;
  filename: string;
  alt: string;
}

interface LayoutItem {
  screenshot: Screenshot;
  colSpan: number;
  rowSpan: number;
  hero: boolean;
  overflow?: number;
}

interface ScreenshotLayout {
  mode: 'single' | 'bento';
  items: LayoutItem[];
  total: number;
  hidden: number;
}

interface RadiusTokens {
  card: string;
  button: string;
  modal: string;
}

interface FieldError {
  error: { code: string; message: string; status?: number; field?: string };
}

function isFieldError(v: unknown): v is FieldError {
  return !!v && typeof v === 'object' && 'error' in (v as object) && !!(v as FieldError).error && typeof (v as FieldError).error === 'object';
}

/** Minimal interface for the <repo-deck> element instance. */
interface RepoDeckElement extends HTMLElement {
  _render?: () => void;
  _state?: { status: string; data?: unknown; error?: unknown };
  openModal: () => void;
  closeModal: () => void;
}

// ---------------------------------------------------------------------------
// i18n (plan §16.10) — lightweight, overridable UI strings.
// ---------------------------------------------------------------------------

var UI_STRINGS = {
'en': {
  loading: 'Loading repo card…',
  errorTitle: 'Could not load this card',
  viewDetails: 'View details',
  openOnGithub: 'Open on GitHub',
  readmeSection: 'Readme',
  screenshotsSection: 'Screenshots',
  resumeSection: 'Summary',
  linkSection: 'Repository',
  starsLabel: 'stars',
  forksLabel: 'forks',
  noScreenshots: 'No screenshots configured in this repo.',
  readmeUnavailable: 'README not available for this repository.',
  resumeUnavailable: 'Resume not available.',
  screenshotsUnavailable: 'No screenshots available.',
  close: 'Close',
  closeDialog: 'Close dialog',
  clickToOpen: 'Repo card — click to open details',
  more: 'more',
},
'pt': {
  loading: 'Carregando card…',
  errorTitle: 'Não foi possível carregar este card',
  viewDetails: 'Ver detalhes',
  openOnGithub: 'Abrir no GitHub',
  readmeSection: 'Readme',
  screenshotsSection: 'Screenshots',
  resumeSection: 'Resumo',
  linkSection: 'Repositório',
  starsLabel: 'estrelas',
  forksLabel: 'forks',
  noScreenshots: 'Nenhuma screenshot configurada neste repo.',
  readmeUnavailable: 'README não disponível neste repositório.',
  resumeUnavailable: 'Resumo não disponível.',
  screenshotsUnavailable: 'Screenshots não disponíveis.',
  close: 'Fechar',
  closeDialog: 'Fechar diálogo',
  clickToOpen: 'Card do repo — clique para ver detalhes',
  more: 'mais',
},
'es': {
  loading: 'Cargando tarjeta…',
  errorTitle: 'No se pudo cargar esta tarjeta',
  viewDetails: 'Ver detalles',
  openOnGithub: 'Abrir en GitHub',
  readmeSection: 'Readme',
  screenshotsSection: 'Capturas',
  resumeSection: 'Resumen',
  linkSection: 'Repositorio',
  starsLabel: 'estrellas',
  forksLabel: 'forks',
  noScreenshots: 'No hay capturas configuradas en este repo.',
  readmeUnavailable: 'README no disponible para este repositorio.',
  resumeUnavailable: 'Resumen no disponible.',
  screenshotsUnavailable: 'Capturas no disponibles.',
  close: 'Cerrar',
  closeDialog: 'Cerrar diálogo',
  clickToOpen: 'Tarjeta del repo — clic para ver detalles',
  more: 'más',
},
'fr': {
  loading: 'Chargement de la carte…',
  errorTitle: 'Impossible de charger cette carte',
  viewDetails: 'Voir les détails',
  openOnGithub: 'Ouvrir sur GitHub',
  readmeSection: 'Readme',
  screenshotsSection: 'Captures d\'écran',
  resumeSection: 'Résumé',
  linkSection: 'Dépôt',
  starsLabel: 'étoiles',
  forksLabel: 'forks',
  noScreenshots: 'Aucune capture configurée dans ce dépôt.',
  readmeUnavailable: 'README non disponible pour ce dépôt.',
  resumeUnavailable: 'Résumé non disponible.',
  screenshotsUnavailable: 'Captures non disponibles.',
  close: 'Fermer',
  closeDialog: 'Fermer le dialogue',
  clickToOpen: 'Carte du dépôt — cliquez pour voir les détails',
  more: 'plus',
},
};

var currentLocale = 'en';

function t(key) {
var bundle = UI_STRINGS[currentLocale] || UI_STRINGS.en;
return bundle[key] || UI_STRINGS.en[key] || key;
}

// (The public API is exported at the bottom of this file via RepoDeckAPI.)

// ---------------------------------------------------------------------------
// Analytics adapter (plan §16.25) — single hook that fans out all internal
// events to any analytics tool the consumer uses.
// ---------------------------------------------------------------------------

var analyticsHandlers = [];
function emitAnalytics(event) {
for (var i = 0; i < analyticsHandlers.length; i++) {
  try { analyticsHandlers[i](event); } catch (e) { /* never let analytics break the card */ }
}
}

// Inline-data pool: an alternative to the runtime fetch. Consumers can
// drop a `<script type="application/json" data-for-repo="…">` block next
// to each `<repo-deck>`, or pre-seed the data via
// `RepoDeckAPI.provideInlineData(cardData)` so any number of cards on the
// page can render without hitting GitHub at all.
var _inlineData = {
  /** Latest CardData prefetched for any owner/repo. Keyed by `owner/repo`. */
  latestByKey: Object.create(null),
  /** Manually-provided data (e.g. via RepoDeckAPI.provideInlineData). */
  manual: null,
};
function _setLatestInline(key, data) { _inlineData.latestByKey[key] = data; }
function getInlineData(el, owner, repo) {
  var key = owner + '/' + repo;
  if (key in _inlineData.latestByKey) return _inlineData.latestByKey[key];
  // Script-based fallback: walk previous siblings looking for a JSON block.
  if (el && el.parentNode) {
    var found = findPreviousInlineScript(el, owner);
    if (found) {
      _setLatestInline(key, found);
      return found;
    }
  }
  if (_inlineData.manual && _inlineData.manual.owner === owner && _inlineData.manual.repo === repo) {
    return _inlineData.manual;
  }
  return null;
}

function findPreviousInlineScript(el, owner) {
  // Walk backwards through previous siblings, picking the first
  // `<script type="application/json" data-for-repo="…">` whose data-for-repo
  // matches this element's `owner/`.
  if (!el || !el.parentNode) return null;
  var repo = el.getAttribute('repo') || '';
  var wantedKey = owner + '/' + repo;
  var node = el.previousSibling;
  while (node) {
    if (node.nodeType === 1 && node.tagName === 'SCRIPT') {
      var t = (node.getAttribute('type') || '').toLowerCase();
      if (t === 'application/json' || t === 'application/x-repodeck+json') {
        var forKey = node.getAttribute('data-for-repo') || node.getAttribute('data-for');
        if (!forKey || forKey === wantedKey) {
          try {
            var data = JSON.parse(node.textContent || '{}');
            if (data && data.meta && data.meta.owner === owner) return data;
          } catch (e) {
            return null;
          }
        }
      }
    }
    node = node.previousSibling;
  }
  return null;
}

// (The dispatch patch is applied inside the else-if block below, after
//  RepoDeck is defined.)

// ---------------------------------------------------------------------------
// --- guard: don't re-define if already loaded ------------------------------

if (typeof customElements !== 'undefined' && customElements.get('repo-deck')) {
  // already defined — skip registration (allows safe re-import)
} else if (typeof customElements !== 'undefined') {

// ---------------------------------------------------------------------------
// Small pure helpers — mirror @repodeck/core (layout, radius) so the web
// component stays a single self-contained file with no build step.
// ---------------------------------------------------------------------------

var RADIUS_PRESETS = {
  sharp: { card: '2px', button: '2px', modal: '2px' },
  soft: { card: '12px', button: '8px', modal: '16px' },
  round: { card: '22px', button: '999px', modal: '24px' },
};

function resolveRadiusTokens(attr) {
  var v = (attr || '').trim();
  if (!v) return RADIUS_PRESETS.soft;
  if (RADIUS_PRESETS[v]) return RADIUS_PRESETS[v];
  if (/^-?\d*\.?\d+(px|rem|em|%|vh|vw|vmin|vmax|ch|ex|pt|pc|in|cm|mm)?$/.test(v)) {
    return { card: v, button: v, modal: v };
  }
  return RADIUS_PRESETS.soft;
}

function assignBentoSpans(count) {
  if (count <= 0) return [];
  if (count === 1) return [{ colSpan: 2, rowSpan: 2, hero: true }];
  if (count === 2) return [
    { colSpan: 2, rowSpan: 2, hero: true },
    { colSpan: 2, rowSpan: 2, hero: false },
  ];
  if (count === 3) return [
    { colSpan: 2, rowSpan: 2, hero: true },
    { colSpan: 2, rowSpan: 1, hero: false },
    { colSpan: 2, rowSpan: 1, hero: false },
  ];
  var spans = [{ colSpan: 2, rowSpan: 2, hero: true }];
  for (var i = 1; i < count; i++) spans.push({ colSpan: 1, rowSpan: 1, hero: false });
  return spans;
}

function resolveScreenshotLayout(screenshots, context) {
  if (!screenshots || screenshots.length === 0) {
    return { mode: 'single', items: [], total: 0, hidden: 0 };
  }
  var total = screenshots.length;

  if (context === 'modal') {
    if (total === 1) return {
      mode: 'single',
      items: [{ screenshot: screenshots[0], colSpan: 1, rowSpan: 1, hero: true, overflow: 0 }],
      total: total, hidden: 0,
    };
    var spans = assignBentoSpans(total);
    return {
      mode: 'bento',
      items: screenshots.map(function (s, i) {
        return { screenshot: s, colSpan: spans[i].colSpan, rowSpan: spans[i].rowSpan, hero: spans[i].hero, overflow: 0 };
      }),
      total: total, hidden: 0,
    };
  }

  // Card context — single cover image only; extras go to the modal (+N indicator).
  return {
    mode: 'single',
    items: [{ screenshot: screenshots[0], colSpan: 2, rowSpan: 2, hero: true, overflow: total - 1 }],
    total: total, hidden: total - 1,
  };
}

function prefersDark() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Defense-in-depth HTML sanitizer using the browser's native DOMParser.
// Strips any tags or attributes not in the allowlist. Works without external
// dependencies since DOMParser is available in all modern browsers.
var SAFE_TAGS = ['p','br','strong','em','b','i','a','ul','ol','li','h1','h2',
  'h3','h4','h5','h6','code','pre','blockquote','img','table','thead','tbody',
  'tr','th','td','hr','span','div','del','sup','sub','section','figure',
  'figcaption','details','summary','dl','dt','dd'];
var SAFE_ATTRS = ['href','src','alt','title','target','rel','width','height',
  'colspan','rowspan','loading'];

function sanitizeHtml(html) {
  if (typeof DOMParser === 'undefined') return html; // SSR fallback: skip
  try {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var body = doc.body;
    if (!body) return '';
    (function walk(parent) {
      var toRemove = [];
      for (var i = 0; i < parent.childNodes.length; i++) {
        var node = parent.childNodes[i];
        if (node.nodeType === 1) { // Element
          var el = node;
          var tag = el.tagName.toLowerCase();
          if (SAFE_TAGS.indexOf(tag) === -1) {
            toRemove.push(el);
            continue;
          }
          // Strip disallowed attributes
          var attrs = [];
          for (var j = 0; j < el.attributes.length; j++) {
            attrs.push(el.attributes[j].name);
          }
          for (var j = 0; j < attrs.length; j++) {
            if (SAFE_ATTRS.indexOf(attrs[j]) === -1) {
              el.removeAttribute(attrs[j]);
            }
          }
          // Block javascript: URIs in href and src
          var href = el.getAttribute('href');
          if (href && /^\s*javascript\s*:/i.test(href)) el.removeAttribute('href');
          var src = el.getAttribute('src');
          if (src && /^\s*javascript\s*:/i.test(src)) el.removeAttribute('src');
          // Force safe link behavior
          if (tag === 'a') {
            el.setAttribute('target', '_blank');
            el.setAttribute('rel', 'noopener noreferrer');
          }
          walk(el);
        }
      }
      for (var k = 0; k < toRemove.length; k++) parent.removeChild(toRemove[k]);
    })(body);
    return body.innerHTML;
  } catch (e) {
    return ''; // On any parsing error, return empty rather than risk unsafe HTML
  }
}

function isFieldError(v) {
  return v && typeof v === 'object' && 'error' in v && v.error && typeof v.error === 'object';
}

// ---------------------------------------------------------------------------
// Stylesheet (Shadow DOM)
// ---------------------------------------------------------------------------

// STYLES is imported from repodeck.css at the top of the file

// ---------------------------------------------------------------------------
// Element
// ---------------------------------------------------------------------------

function RepoDeck() {
  var self = (Reflect && Reflect.construct)
    ? Reflect.construct(HTMLElement, [], RepoDeck)
    : HTMLElement.call(this);
  return self;
}

RepoDeck.prototype = Object.create(HTMLElement.prototype);
RepoDeck.prototype.constructor = RepoDeck;

RepoDeck.observedAttributes = [
'owner', 'repo', 'branch', 'ref', 'preset', 'config-path', 'theme',
'modal-sections', 'radius', 'data-url', 'token', 'no-optimize',
'hide-branding', 'debug', 'lazy', 'show-stats', 'locale',
];

// Lifecycle -----------------------------------------------------------------

RepoDeck.prototype.connectedCallback = function () {
  this._initShadow();
  this._attachThemeWatcher();
  this._debug('mount',
    (this.getAttribute('owner') || '?') + '/' + (this.getAttribute('repo') || '?'),
    'data-url=' + this._getDataUrl(),
    'lazy=' + this.hasAttribute('lazy'));

  // Lazy-load via IntersectionObserver (plan §16.4). When the `lazy` attribute
  // is present, defer the fetch until the card is near the viewport. This
  // saves rate-limit budget on portfolio pages with many cards.
  if (this.hasAttribute('lazy') && 'IntersectionObserver' in window) {
    this._render(); // shows the loading state immediately
    var self = this;
    this._io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          self._io.disconnect();
          self._io = null;
          self._debug('lazy: in view, loading');
          self._loadData();
          break;
        }
      }
    }, { rootMargin: '200px 0px' }); // start loading 200px before visible
    this._io.observe(this);
  } else {
    this._loadData();
  }
};

RepoDeck.prototype.disconnectedCallback = function () {
  if (this._themeMql && this._themeMql.removeListener) this._themeMql.removeListener(this._themeHandler);
  if (this._io) { this._io.disconnect(); this._io = null; }
  revokeOptimizedUrls(this._cardEl);
  this._closed = true;
  this._closeModal(true);
};

RepoDeck.prototype.attributeChangedCallback = function (name, oldV, newV) {
  if (oldV === newV) return;
  // Theme/radius only re-render (no refetch). The rest refetch.
  if (name === 'theme') { this._applyThemeClass(); this._render(); return; }
  if (name === 'radius') { this._applyRadius(); return; }
  if (name === 'show-stats') { this._render(); return; }
  if (name === 'modal-sections' || name === 'hide-branding') { this._render(); return; }
  if (name === 'locale') { this._render(); return; }
  if (name === 'no-optimize') { this._render(); return; }
  if (name === 'debug' || name === 'lazy') { return; }
  // data-url switches fetch strategy (proxy / direct / inline) — refetch.
  if (name === 'data-url') {
    if (this._shadowConnected) this._loadData();
    return;
  }
  // owner/repo/branch/ref/preset/config-path → reload.
  if (this._shadowConnected) this._loadData();
};

// Internal ------------------------------------------------------------------

RepoDeck.prototype._initShadow = function () {
  if (this._shadowConnected) return;
  this._shadowConnected = true;
  var root = this.attachShadow ? this.attachShadow({ mode: 'open' }) : this.createShadowRoot();
  var style = document.createElement('style');
  style.textContent = STYLES;
  root.appendChild(style);

  var card = document.createElement('article');
  card.className = 'rd-card';
  card.setAttribute('tabindex', '0');
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', 'Repo card — click to open details');
  root.appendChild(card);
  this._cardEl = card;

  var backdrop = document.createElement('div');
  backdrop.className = 'rd-modal-backdrop';
  backdrop.setAttribute('data-open', 'false');
  root.appendChild(backdrop);
  this._backdropEl = backdrop;

  var lightbox = document.createElement('div');
  lightbox.className = 'rd-lightbox';
  lightbox.setAttribute('data-open', 'false');
  lightbox.setAttribute('role', 'img');
  root.appendChild(lightbox);
  this._lightboxEl = lightbox;

  var self = this;
  this._cardEl.addEventListener('click', function () { self.openModal(); });
  this._cardEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self.openModal(); }
  });
  this._backdropEl.addEventListener('click', function (e) {
    if (e.target === self._backdropEl) self.closeModal();
  });
  this._lightboxEl.addEventListener('click', function () {
    self._lightboxEl.setAttribute('data-open', 'false');
  });

  this._applyThemeClass();
  this._applyRadius();
};

RepoDeck.prototype._applyThemeClass = function () {
  if (!this._cardEl) return;
  var theme = this.getAttribute('theme') || 'auto';
  if (theme === 'dark') this.setAttribute('theme', 'dark');
  else if (theme === 'light') this.setAttribute('theme', 'light');
  else this.setAttribute('theme', 'auto');
};

RepoDeck.prototype._applyRadius = function () {
  var tokens = resolveRadiusTokens(this.getAttribute('radius'));
  if (!this._shadowConnected) return;
  this.style.setProperty('--repodeck-radius', tokens.card);
  this.style.setProperty('--repodeck-button-radius', tokens.button);
  this.style.setProperty('--repodeck-modal-radius', tokens.modal);
};

RepoDeck.prototype._attachThemeWatcher = function () {
  var self = this;
  if (window.matchMedia) {
    this._themeMql = window.matchMedia('(prefers-color-scheme: dark)');
    this._themeHandler = function () { self._render(); };
    if (this._themeMql.addEventListener) this._themeMql.addEventListener('change', this._themeHandler);
    else if (this._themeMql.addListener) this._themeMql.addListener(this._themeHandler);
  }
};

RepoDeck.prototype._debug = function () {
  if (!this.hasAttribute('debug')) return;
  var args = Array.prototype.slice.call(arguments);
  console.log.apply(console, ['[repo-deck]'].concat(args));
};

RepoDeck.prototype._getDataUrl = function () {
  return this.getAttribute('data-url') || '/api/repodeck/data';
};

RepoDeck.prototype._loadData = function () {
  var self = this;
  var owner = this.getAttribute('owner');
  var repo = this.getAttribute('repo');
  if (!owner || !repo) {
    this._state = { status: 'error', error: { code: 'INVALID_CONFIG', message: 'owner and repo attributes are required.' } };
    this._render();
    return;
  }
  if (this._closed) return;

  // Direct-GitHub mode: call the GitHub REST API straight from the browser.
  // GitHub sends permissive CORS headers for read requests, so this works
  // on any static page without a self-hosted API (subject to 60 req/h
  // anonymous rate limit — use a self-hosted data-url for high traffic).
  var urlVal = this._getDataUrl();

  // Inline mode: CardData was already fetched at build time. Pull it from
  // (a) a `<script type="application/json" data-for-repo="…">` block in
  // the document, or (b) the most recent `RepoDeckAPI.provideInlineData(…)`
  // call. No network is performed.
  if (urlVal === 'inline') {
    this._loadInlineData(owner, repo);
    return;
  }
  if (urlVal === 'github' || urlVal === 'direct') {
    this._loadDataDirect(owner, repo);
    return;
  }

  this._state = { status: 'loading' };
  this._render();

  var params = new URLSearchParams();
  params.set('owner', owner);
  params.set('repo', repo);
  var branch = this.getAttribute('branch');
  if (branch) params.set('branch', branch);
  var ref = this.getAttribute('ref');
  if (ref) params.set('ref', ref);
  var configPath = this.getAttribute('config-path');
  if (configPath) params.set('config-path', configPath);
  var preset = this.getAttribute('preset');
  if (preset) params.set('preset', preset);
  if (this.hasAttribute('show-stats')) params.set('show-stats', 'true');
  if (this.hasAttribute('locale')) params.set('locale', this.getAttribute('locale'));

  var url = this._getDataUrl();
  url = url + (url.indexOf('?') !== -1 ? '&' : '?') + params.toString();
  this._debug('fetch', url);

  // Forward the token (if any) to the proxy via an Authorization header —
  // never in the URL. GitHub's own CORS is permissive, and self-hosted
  // data-url endpoints typically read this header.
  var headers = { Accept: 'application/json' };
  var tokenAttr = this.getAttribute('token');
  if (tokenAttr) headers.Authorization = 'Bearer ' + tokenAttr;
  this._debug('auth', tokenAttr ? 'token present (' + tokenAttr.slice(0, 6) + '…)' : 'anonymous');
  var t0 = Date.now();

  fetch(url, { headers: headers })
    .then(function (res) { return res.json().then(function (j) { return { ok: res.ok, json: j, status: res.status, rate: res.headers.get('x-ratelimit-remaining'), limit: res.headers.get('x-ratelimit-limit') }; }); })
    .then(function (r) {
      if (self._closed) return;
      if (!r.ok || r.json.error) {
        var err = (r.json && r.json.error) || { code: 'NETWORK_ERROR', message: 'Failed to load card data.' };
        self._debug('fetch error', 'status=' + r.status, 'rl=' + r.rate + '/' + r.limit, (Date.now() - t0) + 'ms', err.code || '', err.message);
        self._state = { status: 'error', error: err };
        self._render();
        self._dispatch('repodeck:error', { error: err });
        return;
      }
      self._debug('loaded', 'status=' + r.status, 'cached=' + !!r.json.cached, 'rl=' + r.rate + '/' + r.limit, (Date.now() - t0) + 'ms');
      self._state = { status: 'success', data: r.json.data, cached: !!r.json.cached };
      self._render();
      self._dispatch('repodeck:loaded', { data: r.json.data });
    })
    .catch(function (e) {
      if (self._closed) return;
      var err = { code: 'NETWORK_ERROR', message: String(e && e.message || e) };
      self._debug('fetch error', 'network', (Date.now() - t0) + 'ms', err.message);
      self._state = { status: 'error', error: err };
      self._render();
      self._dispatch('repodeck:error', { error: err });
    });
};

RepoDeck.prototype._dispatch = function (name, detail) {
  this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail: detail || {} }));
};

// Inline-mode loader — uses pre-fetched CardData from a `<script type=
// "application/json" data-for-repo="…">` block or from
// `RepoDeckAPI.provideInlineData`. No network traffic is initiated.

RepoDeck.prototype._loadInlineData = function (owner, repo) {
  var self = this;
  var data = getInlineData(self, owner, repo);
  if (!data) {
    var err = {
      code: 'NOT_FOUND',
      message:
        'No inline CardData found for `' + owner + '/' + repo + '`. ' +
        'Add a `<script type="application/json" data-for-repo="' + owner + '/' + repo + '">` ' +
        'block next to this element, or call ' +
        '`RepoDeckAPI.provideInlineData(cardData)` before mount.',
    };
    this._debug('inline', 'MISS for ' + owner + '/' + repo + ' (no <script> block, no provideInlineData)');
    this._state = { status: 'error', error: err };
    this._render();
    this._dispatch('repodeck:error', { error: err });
    return;
  }
  this._debug('inline', 'HIT for ' + owner + '/' + repo + ' (no network)');
  this._state = { status: 'success', data: data, cached: false, inline: true };
  this._render();
  this._dispatch('repodeck:loaded', { data: data });
  _setLatestInline(owner + '/' + repo, data);
};

// Direct-GitHub mode --------------------------------------------------------
// Calls the GitHub REST API from the browser (CORS-permissive). Builds the
// same CardData shape the server endpoint would return. README markdown is
// rendered with a tiny safe inline renderer (escape-first, so no XSS).

RepoDeck.prototype._loadDataDirect = function (owner, repo) {
  var self = this;
  var branch = this.getAttribute('branch') || 'main';
  var configPath = (this.getAttribute('config-path') || 'config-repodeck').replace(/^\/+|\/+$/g, '');
  var preset = this.getAttribute('preset') || 'standard';
  var token = this.getAttribute('token') || '';

  var include = { readme: true, resume: true, screenshots: true };
  if (preset === 'minimal') { include.readme = false; include.resume = false; }

  this._debug('direct mode', owner + '/' + repo, 'branch=' + branch, 'token=' + (token ? 'yes' : 'no'), 'include=' + Object.keys(include).filter(function (k) { return include[k]; }).join(','));

  this._state = { status: 'loading' };
  this._render();

  function ghHeaders() {
    var h = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (token) h.Authorization = 'Bearer ' + token;
    return h;
  }
  function ghUrl(path) {
    return 'https://api.github.com/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) +
      '/contents/' + encodeURIComponent(path) + '?ref=' + encodeURIComponent(branch);
  }
  function decodeB64(b64) {
    var clean = String(b64).replace(/\n/g, '');
    try { return decodeURIComponent(escape(atob(clean))); } catch (e) { return atob(clean); }
  }
  function fetchFile(path) {
    if (!token) {
      var rawUrl = 'https://raw.githubusercontent.com/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) +
        '/' + encodeURIComponent(branch) + '/' + path.split('/').map(encodeURIComponent).join('/');
      return fetch(rawUrl).then(function (res) {
        if (res.status === 404) return null;
        if (!res.ok) throw new Error('RawCDN ' + res.status);
        return res.text();
      });
    }
    return fetch(ghUrl(path), { headers: ghHeaders() }).then(function (res) {
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('GH ' + res.status);
      return res.json().then(function (j) {
        return j.encoding === 'base64' ? decodeB64(j.content) : (j.content || '');
      });
    });
  }
  function fetchDir(path) {
    return fetch(ghUrl(path), { headers: ghHeaders() }).then(function (res) {
      if (res.status === 404) return [];
      if (!res.ok) throw new Error('GH ' + res.status);
      return res.json();
    }).then(function (arr) {
      return Array.isArray(arr) ? arr.filter(function (e) { return e.type === 'file'; }) : [];
    });
  }
  function fetchRepoMeta() {
    return fetch('https://api.github.com/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo), { headers: ghHeaders() })
      .then(function (res) {
        if (!res.ok) {
          var err: any = new Error(res.status === 404 ? 'Repository not found (404)' : 'GitHub API error (' + res.status + ')');
          err.status = res.status;
          err.code = res.status === 404 ? 'NOT_FOUND' : 'API_ERROR';
          throw err;
        }
        return res.json();
      });
  }

  var tasks = [];
  tasks.push(fetchRepoMeta().then(function (meta) {
    return { key: 'meta', meta: meta };
  }));
  if (include.resume) tasks.push(fetchFile(configPath + '/RESUME.txt').then(function (raw) {
    return raw === null ? { key: 'resume', err: { code: 'NOT_FOUND', message: 'RESUME.txt not found.' } } : { key: 'resume', raw: raw };
  }, function (e) { return { key: 'resume', err: { code: 'NETWORK_ERROR', message: String(e) } }; }));
  if (include.readme) tasks.push(fetchFile(configPath + '/README.md').then(function (raw) {
    return raw === null ? { key: 'readme', err: { code: 'NOT_FOUND', message: 'README.md not found.' } } : { key: 'readme', raw: raw };
  }, function (e) { return { key: 'readme', err: { code: 'NETWORK_ERROR', message: String(e) } }; }));
  if (include.screenshots) tasks.push(fetchDir(configPath + '/screenshots').then(function (entries) {
    return { key: 'screenshots', entries: entries };
  }, function (e) { return { key: 'screenshots', err: { code: 'NETWORK_ERROR', message: String(e) } }; }));

  Promise.all(tasks).then(function (results) {
    if (self._closed) return;
    var data: any = {
      meta: { owner: owner, repo: repo, url: 'https://github.com/' + owner + '/' + repo, branch: branch, configPath: configPath, fetchedAt: Date.now() },
      resume: null, readme: null, screenshots: null, stats: null
    };
    results.forEach(function (r: any) {
      if (r.key === 'meta') {
        data.stats = {
          stars: r.meta.stargazers_count,
          forks: r.meta.forks_count
        };
        data.meta.topics = r.meta.topics || [];
      } else if (r.key === 'resume') {
        data.resume = r.err ? { error: r.err } : directParseResume(r.raw);
      } else if (r.key === 'readme') {
        if (r.err) {
          data.readme = { error: r.err };
        } else {
          var parsedFm = directParseFrontmatter(r.raw);
          data.readme = {
            html: sanitizeHtml(directMarkdown(parsedFm.content)),
            raw: r.raw,
            frontmatter: parsedFm.metadata
          };
        }
      } else if (r.key === 'screenshots') {
        data.screenshots = r.err ? { error: r.err } : directResolveShots(r.entries, owner, repo, branch);
      }
    });
    self._state = { status: 'success', data: data, cached: false, direct: true };
    self._render();
    self._dispatch('repodeck:loaded', { data: data });
  }).catch(function (e) {
    if (self._closed) return;
    var status = e && (e as any).status;
    var code = status === 404 ? 'NOT_FOUND' : 'NETWORK_ERROR';
    var msg = status === 404 ? 'Repository not found (404).' : String(e.message || e);
    var err = { code: code, message: msg };
    self._state = { status: 'error', error: err };
    self._render();
    self._dispatch('repodeck:error', { error: err });
  });
};

function directParseFrontmatter(raw) {
  var m = String(raw || '').match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!m) return { metadata: {}, content: raw || '' };
  var yamlBlock = m[1];
  var content = String(raw || '').slice(m[0].length);
  var metadata = {};
  yamlBlock.split('\n').forEach(function (line) {
    var kv = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.+)$/);
    if (!kv) return;
    var key = kv[1].trim();
    var val = kv[2].trim().replace(/^["']|["']$/g, '');
    if (key === 'order') {
      var n = Number(val);
      if (!isNaN(n)) metadata[key] = n;
      return;
    }
    if (['title', 'order', 'description', 'topics'].indexOf(key) !== -1) {
      metadata[key] = val;
    }
  });
  return { metadata: metadata, content: content };
}

function directParseResume(raw) {
  var text = String(raw).replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  var max = 280;
  if (text.length <= max) return { text: text, truncated: false };
  var cut = text.slice(0, max);
  var ls = cut.lastIndexOf(' ');
  if (ls > max * 0.6) cut = cut.slice(0, ls);
  return { text: cut, truncated: true };
}

function directResolveShots(entries, owner, repo, branch) {
  var exts = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];
  return entries.filter(function (e) {
    return exts.some(function (x) { return e.name.toLowerCase().indexOf(x) === e.name.length - x.length; });
  }).sort(function (a, b) { return a.name.localeCompare(b.name, 'en', { numeric: true }); }).map(function (e) {
    var raw = 'https://raw.githubusercontent.com/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/' + encodeURIComponent(branch) + '/' + e.path.split('/').map(encodeURIComponent).join('/');
    return { url: raw, filename: e.name, alt: e.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ') };
  });
}

// Minimal, escape-first markdown renderer (safe by construction).
function directMarkdown(md) {
  var esc = escapeHtml(md);
  // fenced code
  esc = esc.replace(/```([\s\S]*?)```/g, function (_, c) { return '<pre><code>' + c + '</code></pre>'; });
  // inline code
  esc = esc.replace(/`([^`]+)`/g, '<code>$1</code>');
  // headers
  esc = esc.replace(/^######\s?(.*)$/gm, '<h6>$1</h6>')
    .replace(/^#####\s?(.*)$/gm, '<h5>$1</h5>')
    .replace(/^####\s?(.*)$/gm, '<h4>$1</h4>')
    .replace(/^###\s?(.*)$/gm, '<h3>$1</h3>')
    .replace(/^##\s?(.*)$/gm, '<h2>$1</h2>')
    .replace(/^#\s?(.*)$/gm, '<h1>$1</h1>');
  // bold / italic
  esc = esc.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // links [text](url) — only allow http(s) and relative
  esc = esc.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  // hr
  esc = esc.replace(/^---+$/gm, '<hr/>');
  // blockquote
  esc = esc.replace(/^&gt;\s?(.*)$/gm, '<blockquote>$1</blockquote>');
  // lists (simple)
  esc = esc.replace(/^(?:- |\* )(.*)$/gm, '<li>$1</li>');
  esc = esc.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>');
  // paragraphs: wrap loose text blocks
  esc = esc.split(/\n{2,}/).map(function (blk) {
    if (/^\s*<(h\d|ul|ol|pre|blockquote|hr|table)/.test(blk)) return blk;
    return '<p>' + blk.replace(/\n/g, '<br/>') + '</p>';
  }).join('\n');
  return esc;
}

// Rendering -----------------------------------------------------------------

RepoDeck.prototype._render = function () {
  if (!this._shadowConnected || !this._cardEl) return;
  // Sync the module-level currentLocale with this element's locale
  // attribute so t() resolves the right bundle during rendering.
  if (this.hasAttribute('locale')) currentLocale = this.getAttribute('locale');
  var state = this._state || { status: 'loading' };
  this._debug('render', 'status=' + state.status,
    'preset=' + (this.getAttribute('preset') || 'standard'),
    'theme=' + (this.getAttribute('theme') || 'auto'),
    'locale=' + (this.getAttribute('locale') || 'en'));
  var el = this._cardEl;
  revokeOptimizedUrls(el);
  if (state.status === 'loading') {
    // Skeleton loader — better perceived performance than a bare spinner.
    el.innerHTML =
      '<div class="rd-skeleton">' +
        '<div class="rd-skeleton-media"></div>' +
        '<div class="rd-skeleton-body">' +
          '<div class="rd-skeleton-line w-40"></div>' +
          '<div class="rd-skeleton-line w-80"></div>' +
          '<div class="rd-skeleton-line w-60"></div>' +
        '</div>' +
      '</div>';
    return;
  }
  if (state.status === 'error') {
    var code = state.error.code || 'UNKNOWN';
    var icon = '<svg class="rd-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    el.innerHTML =
      '<div class="rd-error">' +
      icon +
      '<div class="rd-error-title">Could not load this card</div>' +
      '<div class="rd-error-msg">' + escapeHtml(state.error.message || 'Unknown error') + '</div>' +
      '<div class="rd-error-code">' + escapeHtml(code) + '</div>' +
      '</div>';
    return;
  }
  // success
  var data = state.data;
  var preset = this.getAttribute('preset') || 'standard';
  var shots = (data.screenshots && !isFieldError(data.screenshots)) ? data.screenshots : [];
  this._debug('render', 'success', 'shots=' + shots.length,
    shots.length > 1 ? 'card=cover +' + (shots.length - 1) + ' hidden' : (shots.length === 1 ? 'card=cover' : 'card=fallback'));
  var html = this._renderCardInner(data, preset);
  el.innerHTML = html;
  var cover = el.querySelector('.rd-single img');
  if (cover) optimizeImg(cover, this);
};

RepoDeck.prototype._renderCardInner = function (data, preset) {
  var meta = data.meta;
  var shots = (!data.screenshots || isFieldError(data.screenshots)) ? [] : data.screenshots;
  var resume = data.resume && !isFieldError(data.resume) ? data.resume : null;
  var readme = data.readme && !isFieldError(data.readme) ? data.readme : null;
  var detailed = preset === 'detailed';
  var minimal = preset === 'minimal';
  var showStats = this.hasAttribute('show-stats');
  var stats = data.stats && !isFieldError(data.stats) ? data.stats : null;

  // Frontmatter override (plan §16.18): per-project title.
  var fm = data.readme && !isFieldError(data.readme) && readme.frontmatter ? readme.frontmatter : null;
  var displayTitle = (fm && fm.title) ? fm.title : meta.repo;

  var media = '';
  var layout = resolveScreenshotLayout(shots, 'card');
  if (shots.length === 0) {
    var initials = (displayTitle || '?').replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'RC';
    var hue = hashHue(meta.owner + '/' + meta.repo);
    media = '<div class="rd-fallback" style="--rc-fallback-bg: linear-gradient(135deg, hsl(' + hue + ',70%,55%), hsl(' + ((hue + 40) % 360) + ',70%,45%))">' + escapeHtml(initials) + '</div>';
  } else {
    var it = layout.items[0];
    media = '<div class="rd-single"><img src="' + escapeHtml(it.screenshot.url) + '" alt="' + escapeHtml(it.screenshot.alt) + '"' + optCrossorigin(this) + ' loading="lazy" />' +
      (it.overflow ? '<div class="rd-overflow">+' + it.overflow + '</div>' : '') + '</div>';
  }

  var body = '';
  // Head: owner/repo + badges
  var badges = '<span class="rd-stat" title="Branch">' + escapeHtml(meta.branch) + '</span>';
  if (showStats && stats && typeof stats.stars === 'number') {
    badges = '<span class="rd-stars" title="' + stats.stars + ' ' + t('starsLabel') + '"><svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>' + formatCount(stats.stars) + '</span>' + badges;
  }
  body += '<div class="rd-head"><div class="rd-titles">' +
    '<div class="rd-repo">' + escapeHtml(meta.owner) + '</div>' +
    '<div class="rd-title">' + escapeHtml(displayTitle) + '</div>' +
    '</div><div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">' + badges + '</div></div>';

  // Resume: hidden on minimal preset (plan §4).
  if (!minimal) {
    if (resume && resume.text) {
      body += '<p class="rd-resume' + (resume.truncated ? ' rd-truncated' : '') + '">' + escapeHtml(resume.text) + '</p>';
    } else if (data.resume && isFieldError(data.resume)) {
      body += '<p class="rd-resume" style="opacity:.55;font-style:italic">' + t('resumeUnavailable') + '</p>';
    }
  }

  if (detailed && readme && readme.raw) {
    var preview = stripMd(readme.raw).slice(0, 140);
    if (preview) body += '<p class="rd-readme-preview">' + escapeHtml(preview) + '…</p>';
  }

  // Foot: hint with arrow + preset tag
  var arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
  body += '<div class="rd-foot">' +
    '<span class="rd-hint">' + t('viewDetails') + ' ' + arrow + '</span>' +
    '<span class="rd-tag">' + escapeHtml(preset) + '</span>' +
    '</div>';

  return '<div class="rd-media">' + media + '</div><div class="rd-body">' + body + '</div>';
};

// Modal ---------------------------------------------------------------------

RepoDeck.prototype.openModal = function () {
  var self = this;
  if (!this._state || this._state.status !== 'success') return;
  if (this._modalOpen) return;
  this._modalOpen = true;
  this._lastFocused = document.activeElement;

  var backdrop = this._backdropEl;
  var data = this._state.data;
  var sections = (this.getAttribute('modal-sections') || 'readme,screenshots,link')
    .split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  this._debug('modal', 'open sections=' + sections.join(','));

  var meta = data.meta;
  var stats = data.stats && !isFieldError(data.stats) ? data.stats : null;
  var statsHtml = '';
  if (stats && typeof stats.stars === 'number') {
    statsHtml = '<span class="rd-modal-branch" style="background:color-mix(in srgb,#fbbf24 18%,transparent);color:#b45309"><svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" style="vertical-align:-1px"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg> ' + formatCount(stats.stars) + ' stars</span>';
  }
  if (stats && typeof stats.forks === 'number') {
    statsHtml += '<span class="rd-modal-branch"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:-1px"><circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M18 8v2c0 1.5-.5 2-2 2H8c-1.5 0-2 .5-2 2"/></svg> ' + formatCount(stats.forks) + ' forks</span>';
  }
  var head =
    '<div class="rd-modal-titles">' +
    '<div class="rd-modal-repo">' + escapeHtml(meta.owner) + '</div>' +
    '<div class="rd-modal-title">' + escapeHtml(meta.repo) + '</div>' +
    '<div class="rd-modal-sub"><a href="' + escapeHtml(meta.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(meta.url) + '</a> <span class="rd-modal-branch">' + escapeHtml(meta.branch) + '</span>' + statsHtml + '</div>' +
    '</div>' +
    '<button class="rd-modal-close" aria-label="' + t('closeDialog') + '" data-close>✕</button>';

  var bodyHtml = sections.map(function (sec) { return self._renderModalSection(sec, data); }).join('');

  var branding = this.hasAttribute('hide-branding') ? '' :
    '<div class="rd-branding">powered by <a href="https://github.com" target="_blank" rel="noopener noreferrer">repodeck</a></div>';

  backdrop.innerHTML =
    '<div class="rd-modal" role="dialog" aria-modal="true" aria-label="' + escapeHtml(meta.owner + '/' + meta.repo) + ' details">' +
    '<div class="rd-modal-head">' + head + '</div>' +
    '<div class="rd-modal-body">' + bodyHtml + '</div>' +
    branding +
    '</div>';

  // Teleport the overlays into the shared host so `position: fixed` escapes
  // any ancestor containing-block (e.g. `contain: paint` from
  // content-visibility on list items) and the modal covers the viewport.
  var host = ensureModalHost(STYLES);
  if (host && host._rdRoot) {
    host._rdRoot.appendChild(backdrop);
    host._rdRoot.appendChild(this._lightboxEl);
    this._applyModalTheme(backdrop);
  }

  backdrop.setAttribute('data-open', 'true');
  document.body.style.overflow = 'hidden';

  // Wire close button
  backdrop.querySelector('[data-close]').addEventListener('click', function () { self.closeModal(); });
  this._applyTileRatios(backdrop);

  // Convert modal screenshots to WebP (unless `no-optimize`).
  backdrop.querySelectorAll('.rd-modal-bento .rd-tile img, .rd-single-modal .rd-tile img').forEach(function (img) {
    optimizeImg(img, self);
  });

  // Focus trap + ESC
  this._modalKeyHandler = function (e) {
    if (e.key === 'Escape') { e.preventDefault(); self.closeModal(); return; }
    if (e.key === 'Tab') { self._trapFocus(e); }
  };
  backdrop.addEventListener('keydown', this._modalKeyHandler);

  // Wire screenshot zoom
  var tiles = backdrop.querySelectorAll('.rd-modal-bento .rd-tile, .rd-single-modal .rd-tile');
  tiles.forEach(function (tile) {
    tile.addEventListener('click', function () {
      var img = tile.querySelector('img');
      if (!img) return;
      self._lightboxEl.innerHTML = '<img src="' + img.src + '" alt="' + (img.getAttribute('alt') || '') + '"' + optCrossorigin(self) + ' />';
      var lx = self._lightboxEl.querySelector('img');
      if (lx) optimizeImg(lx, self);
      self._lightboxEl.setAttribute('data-open', 'true');
    });
  });

  // Move focus into modal
  var focusable = backdrop.querySelector('a, button, [tabindex]');
  if (focusable) setTimeout(function () { focusable.focus(); }, 30);

  this._dispatch('repodeck:modal-open', { data: data });
};

RepoDeck.prototype._renderModalSection = function (section, data) {
  var self = this;
  var errIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
  if (section === 'readme') {
    var readme = data.readme;
    if (!readme) return '';
    if (isFieldError(readme)) {
      return '<section class="rd-section"><div class="rd-section-title">' + t('readmeSection') + '</div><div class="rd-section-error">' + errIcon + t('readmeUnavailable') + '</div></section>';
    }
    return '<section class="rd-section"><div class="rd-section-title">' + t('readmeSection') + '</div><div class="rd-readme">' + sanitizeHtml(readme.html) + '</div></section>';
  }
  if (section === 'screenshots') {
    var shots = data.screenshots;
    if (!shots) return '';
    if (isFieldError(shots)) {
      return '<section class="rd-section"><div class="rd-section-title">' + t('screenshotsSection') + '</div><div class="rd-section-error">' + errIcon + t('screenshotsUnavailable') + '</div></section>';
    }
    if (shots.length === 0) {
      return '<section class="rd-section"><div class="rd-section-title">' + t('screenshotsSection') + '</div><div class="rd-section-error">' + errIcon + t('noScreenshots') + '</div></section>';
    }
    var layout = resolveScreenshotLayout(shots, 'modal');
    var grid = layout.items.map(function (it) {
      return '<div class="rd-tile' + (it.hero ? ' hero' : '') + '" data-filename="' + escapeHtml(it.screenshot.filename) + '" style="--cspan:' + it.colSpan + ';--rspan:' + it.rowSpan + '" tabindex="0" role="button" aria-label="Zoom screenshot ' + escapeHtml(it.screenshot.alt) + '">' +
        '<img src="' + escapeHtml(it.screenshot.url) + '" alt="' + escapeHtml(it.screenshot.alt) + '"' + optCrossorigin(self) + ' loading="lazy" />' +
        '</div>';
    }).join('');
    return '<section class="rd-section"><div class="rd-section-title">' + t('screenshotsSection') + '<span class="rd-section-title-count">' + shots.length + '</span></div><div class="rd-modal-bento">' + grid + '</div></section>';
  }
  if (section === 'resume') {
    var resume = data.resume;
    if (!resume) return '';
    if (isFieldError(resume)) {
      return '<section class="rd-section"><div class="rd-section-title">' + t('resumeSection') + '</div><div class="rd-section-error">' + errIcon + t('resumeUnavailable') + '</div></section>';
    }
    return '<section class="rd-section"><div class="rd-section-title">' + t('resumeSection') + '</div><p style="margin:0;color:var(--repodeck-text-color);line-height:1.7;font-size:.92rem">' + escapeHtml(resume.text) + '</p></section>';
  }
  if (section === 'link') {
    var meta = data.meta;
    var extIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
    return '<section class="rd-section"><div class="rd-section-title">' + t('linkSection') + '</div>' +
      '<a class="rd-link-btn" href="' + escapeHtml(meta.url) + '" target="_blank" rel="noopener noreferrer">' + t('openOnGithub') + ' ' + extIcon + '</a>' +
      '</section>';
  }
  return '';
};

RepoDeck.prototype.closeModal = function () { this._closeModal(false); };
RepoDeck.prototype._closeModal = function (silent) {
  if (!this._modalOpen) return;
  this._debug('modal', 'close');
  this._modalOpen = false;
  var backdrop = this._backdropEl;
  revokeOptimizedUrls(backdrop);
  backdrop.setAttribute('data-open', 'false');
  backdrop.innerHTML = '';
  if (this._lightboxEl) {
    revokeOptimizedUrls(this._lightboxEl);
    this._lightboxEl.setAttribute('data-open', 'false');
    this._lightboxEl.innerHTML = '';
  }
  if (this._modalKeyHandler) {
    backdrop.removeEventListener('keydown', this._modalKeyHandler);
    this._modalKeyHandler = null;
  }
  // Return the overlays to this card's shadow root so closed modals don't
  // linger in the document body.
  var cardRoot = this.shadowRoot;
  if (cardRoot) {
    if (backdrop.parentNode !== cardRoot) cardRoot.appendChild(backdrop);
    if (this._lightboxEl && this._lightboxEl.parentNode !== cardRoot) cardRoot.appendChild(this._lightboxEl);
  }
  document.body.style.overflow = '';
  if (this._lastFocused && this._lastFocused.focus) this._lastFocused.focus();
  if (!silent) this._dispatch('repodeck:modal-close', {});
};

RepoDeck.prototype._trapFocus = function (e) {
  var modal = this._backdropEl.querySelector('.rd-modal');
  if (!modal) return;
  var focusable = modal.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input, textarea, select');
  if (focusable.length === 0) return;
  var first = focusable[0];
  var last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
};

// Public alias for plan §6 `renderModalSections`.
RepoDeck.prototype.renderModalSections = function (data, sections) {
  var self = this;
  return sections.map(function (s) { return self._renderModalSection(s, data); }).join('');
};

// Helpers -------------------------------------------------------------------

function hashHue(str) {
  var h = 0;
  for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}

/** Modal: copy the host's resolved `--repodeck-*` theme variables onto the
 *  teleported backdrop so the modal keeps its theme outside the shadow. */
RepoDeck.prototype._applyModalTheme = function (el) {
  var computed;
  try { computed = window.getComputedStyle(this); } catch (e) { return; }
  var css = '';
  for (var i = 0; i < MODAL_THEME_PROPS.length; i++) {
    var val = computed.getPropertyValue('--repodeck-' + MODAL_THEME_PROPS[i]);
    if (val) css += '--repodeck-' + MODAL_THEME_PROPS[i] + ':' + val + ';';
  }
  if (css) el.style.cssText = css;
};

/** Modal: apply each screenshot's natural aspect ratio to its tile so object-fit never crops. */
RepoDeck.prototype._applyTileRatios = function (root) {
  var imgs = root ? root.querySelectorAll('.rd-tile img') : [];
  for (var i = 0; i < imgs.length; i++) {
    (function (img) {
      function apply() {
        var tile = img.parentElement;
        if (!tile || !img.naturalWidth || !img.naturalHeight) return;
        tile.style.setProperty('--rd-ratio', img.naturalWidth + ' / ' + img.naturalHeight);
      }
      if (img.complete && img.naturalWidth > 0) apply();
      else img.addEventListener('load', apply, { once: true });
    })(imgs[i]);
  }
};

/** 1234 → "1.2k", 1500000 → "1.5M" — compact star/fork counts. */
function formatCount(n) {
  if (n === null || n === undefined || isNaN(n)) return '0';
  if (n < 1000) return String(n);
  if (n < 1000000) return (n / 1000).toFixed(n < 10000 ? 1 : 0).replace(/\.0$/, '') + 'k';
  return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
}

/** #ea580c → rgba(234,88,12,0.12) — for frontmatter accent color overrides. */
function hexToRgba(hex, alpha) {
  var h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
  if (h.length !== 6) return hex;
  var r = parseInt(h.slice(0, 2), 16);
  var g = parseInt(h.slice(2, 4), 16);
  var b = parseInt(h.slice(4, 6), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

function stripMd(md) {
  return String(md || '')
    .replace(/^---[\s\S]*?---/, '') // frontmatter
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Modal teleport host -------------------------------------------------------
// The card's modal/lightbox are `position: fixed` overlays. Any ancestor that
// establishes a containing block (transform, filter, contain:paint — incl.
// `content-visibility` on list items) would trap the overlay. On open we move
// both elements into a single per-document host container's shadow root, so
// the overlay always covers the viewport while still getting scoped styles
// from this component's stylesheet.
// ---------------------------------------------------------------------------

var MODAL_THEME_PROPS = [
  'text-color', 'title-color', 'muted-color',
  'accent', 'accent-fg', 'accent-soft',
  'radius', 'button-radius', 'modal-radius',
  'modal-bg', 'modal-overlay',
  'shadow', 'shadow-hover',
  'bg', 'border',
  'modal-width', 'modal-max-width', 'modal-max-height'
];

var modalHost = null;

function ensureModalHost(cssText) {
  if (modalHost && document.body && document.body.contains(modalHost)) return modalHost;
  if (!document.body) return null;
  modalHost = document.createElement('div');
  modalHost.className = 'rd-repodeck-modal-host';
  var root = modalHost.attachShadow ? modalHost.attachShadow({ mode: 'open' }) : null;
  if (root) {
    var style = document.createElement('style');
    // Reuse the full card stylesheet (modal + lightbox rules included).
    // The `:host` block would turn this container into a containing block
    // (container-type: inline-size), so neutralize that here.
    style.textContent = cssText + '\n:host { container-type: normal !important; contain: none !important; }';
    root.appendChild(style);
    modalHost._rdRoot = root;
  }
  document.body.appendChild(modalHost);
  return modalHost;
}

// Image optimization (WebP) --------------------------------------------------
// Screenshots are served as PNG/JPEG from GitHub raw — heavy for the browser.
// Re-encode them client-side to WebP (canvas + toBlob) once they load, capped
// at OPT_MAX_DIM on the longest edge, and swap the <img> src to the resulting
// blob URL. ON by default; disable per-card/list with the `no-optimize`
// attribute. Already-optimized (webp/avif), animated (gif) or vector (svg)
// images are left alone.
//
// A canvas can only be read when the image was fetched in CORS mode, so the
// <img> tags are emitted with crossorigin="anonymous" (raw.githubusercontent
// sends Access-Control-Allow-Origin: *). Hosts without CORS headers fail the
// load — we then drop the attribute and retry the original URL so the image
// still displays (just not optimized). Encoder absence or a tainted canvas
// marks only that image as failed and keeps the original.
// ---------------------------------------------------------------------------

var OPT_MAX_DIM = 1600;   // longest-edge cap for the converted frame (px)
var OPT_QUALITY = 0.8;    // WebP encoder quality

function optCrossorigin(host) {
  return host && !host.hasAttribute('no-optimize') ? ' crossorigin="anonymous"' : '';
}

function optimizeImg(img, host) {
  if (!img || !host || host.hasAttribute('no-optimize')) return;
  if (img._rdOptDone || img._rdOptCorsFailed) return;
  var src = img.getAttribute('src') || '';
  if (/\.(webp|avif|svg|gif)(\?|#|$)/i.test(src)) return;
  if ((img.src || '').indexOf('blob:') === 0) return; // already converted
  if (!img.hasAttribute('crossorigin')) return; // non-CORS host — leave alone
  img._rdOptDone = true;
  if (img.complete) {
    if (img.naturalWidth > 0) runImgConversion(img);
    else { // load already failed (CORS-blocked?) — retry without crossorigin
      img._rdOptDone = false;
      img._rdOptCorsFailed = true;
      img.removeAttribute('crossorigin');
      if (img.getAttribute('src')) img.src = img.getAttribute('src');
    }
  } else {
    img.addEventListener('load', function () { runImgConversion(img); }, { once: true });
    img.addEventListener('error', function () {
      img._rdOptDone = false;
      img._rdOptCorsFailed = true;
      img.removeAttribute('crossorigin');
      if (img.getAttribute('src')) img.src = img.getAttribute('src');
    }, { once: true });
  }
}

function runImgConversion(img) {
  if (!img || img.naturalWidth <= 0 || img._rdOptFailed) return;
  if ((img.src || '').indexOf('blob:') === 0) return; // already converted
  try {
    var scale = Math.min(1, OPT_MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(function (blob) {
      if (!blob) { img._rdOptFailed = true; return; } // tainted canvas or no encoder
      var url = URL.createObjectURL(blob);
      var prev = img._rdOptUrl;
      img._rdOptUrl = url;
      img.src = url;
      if (prev) URL.revokeObjectURL(prev);
    }, 'image/webp', OPT_QUALITY);
  } catch (e) { img._rdOptFailed = true; /* tainted canvas — keep the original */ }
}

function revokeOptimizedUrls(root) {
  if (!root) return;
  var imgs = root.querySelectorAll('img');
  for (var i = 0; i < imgs.length; i++) {
    var url = imgs[i]._rdOptUrl;
    if (url) { try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ } imgs[i]._rdOptUrl = null; }
  }
}

// <repodeck-list> — a portfolio grid component (plan §16.21).
// Receives a comma-separated `repos="owner/repo,owner/repo"` list and renders
// coordinated <repo-deck> children with consistent spacing + staggered
// lazy-loading to avoid thundering-herd rate-limit consumption.
// ---------------------------------------------------------------------------

function RepoDeckList() {
  var self = (Reflect && Reflect.construct)
    ? Reflect.construct(HTMLElement, [], RepoDeckList)
    : HTMLElement.call(this);
  return self;
}
RepoDeckList.prototype = Object.create(HTMLElement.prototype);
RepoDeckList.prototype.constructor = RepoDeckList;

RepoDeckList.observedAttributes = ['repos', 'preset', 'theme', 'radius', 'cols', 'gap', 'lazy', 'show-stats', 'data-url', 'modal-sections', 'config-path', 'sort', 'sort-order', 'locale', 'batch-check', 'filter-tag', 'token', 'no-optimize', 'debug', 'hide-branding'];

RepoDeckList.prototype.connectedCallback = function () {
  this._renderList();
};

/** Batch rate-limit check (plan §16.22). Before rendering N cards, ask the
 *  batch-check endpoint whether the rate-limit budget can absorb the load.
 *  If not, stagger the card loads by `suggestedDelayMs`. */
RepoDeckList.prototype._performBatchCheck = function (count, cb) {
  var self = this;
  var urlAttr = this.getAttribute('data-url');
  if (!this.hasAttribute('batch-check') || !urlAttr || urlAttr === 'github' || urlAttr === 'direct') {
    cb(0);
    return;
  }
  var baseUrl = this.getAttribute('data-url') || '';
  // Derive the batch-check URL from the data-url (same /api/repodeck/ prefix).
  var checkUrl = baseUrl.replace(/\/data.*$/, '').replace(/\/sample.*$/, '') + '/batch-check?count=' + count;
  fetch(checkUrl).then(function (r) { return r.json(); }).then(function (info) {
    if (info && info.canProceed === false && info.suggestedDelayMs > 0) {
      self._debug && self._debug('batch-check: staggering by', info.suggestedDelayMs, 'ms');
      cb(info.suggestedDelayMs);
    } else {
      cb(0);
    }
  }).catch(function () { cb(0); });
};

RepoDeckList.prototype.attributeChangedCallback = function (name, oldV, newV) {
  if (oldV === newV) return;
  // filter-tag changes only re-filter, not re-render (avoids reloading cards).
  if (name === 'filter-tag' && this._connected) {
    this._maybeFilter();
    return;
  }
  if (this._connected) this._renderList();
};

RepoDeckList.prototype._renderList = function () {
  this._connected = true;
  var self = this;
  var reposAttr = this.getAttribute('repos') || '';
  var repos = reposAttr.split(',').map(function (s) { return s.trim(); }).filter(Boolean).map(function (s) {
    var parts = s.split('/');
    return { owner: parts[0], repo: parts.slice(1).join('/') };
  }).filter(function (r) { return r.owner && r.repo; });

  // Shared attributes to forward to each child <repo-deck>.
  var sharedAttrs = ['preset', 'theme', 'radius', 'data-url', 'modal-sections', 'config-path', 'token', 'locale'];
  var boolAttrs = ['lazy', 'show-stats', 'debug', 'hide-branding', 'no-optimize'];

  var cols = this.getAttribute('cols') || 'auto';
  var gap = this.getAttribute('gap') || '20px';

  // Batch rate-limit check (plan §16.22). If enabled and the budget can't
  // absorb all cards, we still render but the caller could stagger. The
  // check runs async; we render immediately and let it inform future loads.
  if (this.hasAttribute('batch-check') && repos.length > 0) {
    this._performBatchCheck(repos.length, function (delayMs) {
      if (delayMs > 0 && self._grid) {
        // Show a brief notice; cards still load, just staggered.
        var notice = document.createElement('div');
        notice.className = 'rd-list-notice';
        notice.style.cssText = 'grid-column:1/-1;text-align:center;padding:8px;font-size:.72rem;color:#6b7280;background:rgba(245,158,11,.1);border-radius:8px;margin-bottom:8px;';
        notice.textContent = 'Rate limit low — staggering card loads by ' + Math.round(delayMs / 1000) + 's to avoid failures.';
        self._grid.insertBefore(notice, self._grid.firstChild);
      }
    });
  }

  // Build the shadow root with a grid container.
  if (!this._shadowRoot) {
    this._shadowRoot = this.attachShadow ? this.attachShadow({ mode: 'open' }) : this.createShadowRoot();
    this._grid = document.createElement('div');
    this._grid.className = 'rd-list';
    this._shadowRoot.appendChild(this._grid);
  }
  // The grid layout (columns/gap) lives in a shadow <style>. Re-apply it on
  // every render so `cols`/`gap` attribute changes take effect after mount
  // (React-style hosts update attributes on a live element instead of
  // recreating the list from scratch).
  var style = this._shadowRoot.querySelector('style');
  if (!style) {
    style = document.createElement('style');
    this._shadowRoot.insertBefore(style, this._grid);
  }
  style.textContent = [
    ':host { display: block; }',
    '.rd-list { display: grid; gap: ' + gap + '; grid-template-columns: repeat(' + (cols === 'auto' ? 'auto-fill' : cols) + ', minmax(280px, 1fr)); }',
    '.rd-list-item { content-visibility: auto; contain-intrinsic-size: auto 420px; animation: rd-list-in .4s ease both; }',
      '.rd-list-item:nth-child(1) { animation-delay: 0s; }',
    '.rd-list-item:nth-child(2) { animation-delay: .06s; }',
    '.rd-list-item:nth-child(3) { animation-delay: .12s; }',
    '.rd-list-item:nth-child(4) { animation-delay: .18s; }',
    '.rd-list-item:nth-child(5) { animation-delay: .24s; }',
    '.rd-list-item:nth-child(6) { animation-delay: .30s; }',
    '.rd-list-item:nth-child(7) { animation-delay: .36s; }',
    '.rd-list-item:nth-child(8) { animation-delay: .42s; }',
      '.rd-list-empty { grid-column: 1 / -1; text-align: center; padding: 40px; color: #6b7280; font-size: .9rem; }',
      '@keyframes rd-list-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }',
      '@media (max-width: 640px) { .rd-list { grid-template-columns: 1fr; } }',
      '@media (prefers-reduced-motion: reduce) { .rd-list-item { animation: none !important; } }',
    ].join('\n');

  this._grid.innerHTML = '';

  if (repos.length === 0) {
    this._grid.innerHTML = '<div class="rd-list-empty">No repos configured. Add <code>repos="owner/repo,owner/repo"</code> to the &lt;repodeck-list&gt; element.</div>';
    return;
  }

  var sortBy = this.getAttribute('sort') || 'none'; // none | order | stars | name
  var sortOrder = this.getAttribute('sort-order') || 'asc'; // asc | desc

  repos.forEach(function (r, i) {
    var wrapper = document.createElement('div');
    wrapper.className = 'rd-list-item';
    wrapper.setAttribute('data-index', String(i));
    var card = document.createElement('repo-deck');
    card.setAttribute('owner', r.owner);
    card.setAttribute('repo', r.repo);
    sharedAttrs.forEach(function (attr) {
      var val = self.getAttribute(attr);
      if (val !== null) card.setAttribute(attr, val);
    });
    boolAttrs.forEach(function (attr) {
      if (self.hasAttribute(attr)) card.setAttribute(attr, '');
    });

    // Listen for the card's loaded event to extract frontmatter `order` /
    // stats / tags for sorting + filtering (plan §16.23). We re-sort and
    // re-filter the grid once enough cards have reported.
    card.addEventListener('repodeck:loaded', function () {
      var data = card._state && card._state.data;
      if (!data) return;
      var fm = data.readme && !isFieldError(data.readme) && data.readme.frontmatter ? data.readme.frontmatter : null;
      var order = fm && typeof fm.order === 'number' ? fm.order : 999;
      var stars = data.stats && !isFieldError(data.stats) && typeof data.stats.stars === 'number' ? data.stats.stars : 0;
      var name = r.repo.toLowerCase();
      var tags = fm && typeof fm.topics === 'string' ? fm.topics : '';
      wrapper.setAttribute('data-order', String(order));
      wrapper.setAttribute('data-stars', String(stars));
      wrapper.setAttribute('data-name', name);
      wrapper.setAttribute('data-tags', tags.toLowerCase());
      self._maybeSort();
      self._maybeFilter();
    });

    wrapper.appendChild(card);
    self._grid.appendChild(wrapper);
  });
};

/** Filters grid items by the `filter-tag` attribute (plan §16.23).
 *  Cards whose frontmatter `tags` don't include the active tag are hidden. */
RepoDeckList.prototype._maybeFilter = function () {
  var filterTag = (this.getAttribute('filter-tag') || '').trim().toLowerCase();
  var items = this._grid.querySelectorAll('.rd-list-item');
  var visibleCount = 0;
  items.forEach(function (it) {
    var tags = it.getAttribute('data-tags') || '';
    var matches = !filterTag || tags.split(',').map(function (t) { return t.trim(); }).indexOf(filterTag) !== -1;
    it.style.display = matches ? '' : 'none';
    if (matches) visibleCount++;
  });
  // Show/hide empty state.
  var empty = this._grid.querySelector('.rd-list-empty-filter');
  if (visibleCount === 0 && filterTag) {
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'rd-list-empty-filter rd-list-empty';
      empty.textContent = 'No repos match the tag "' + filterTag + '".';
      this._grid.appendChild(empty);
    }
  } else if (empty) {
    empty.remove();
  }
};

/** Re-sorts the grid items by the active sort key. Called as each card
 * reports its loaded data. Only re-orders when all cards have reported. */
RepoDeckList.prototype._maybeSort = function () {
  var sortBy = this.getAttribute('sort') || 'none';
  if (sortBy === 'none') return;
  var items = Array.prototype.slice.call(this._grid.querySelectorAll('.rd-list-item'));
  // Only sort when all items have their data attributes set.
  var allReady = items.every(function (it) { return it.hasAttribute('data-order') || it.hasAttribute('data-stars') || it.hasAttribute('data-name'); });
  if (!allReady && (sortBy === 'order' || sortBy === 'stars')) return;
  var sortOrder = this.getAttribute('sort-order') === 'desc' ? -1 : 1;
  items.sort(function (a, b) {
    var av, bv;
    if (sortBy === 'order') { av = Number(a.getAttribute('data-order') || 999); bv = Number(b.getAttribute('data-order') || 999); }
    else if (sortBy === 'stars') { av = Number(a.getAttribute('data-stars') || 0); bv = Number(b.getAttribute('data-stars') || 0); }
    else if (sortBy === 'name') { av = a.getAttribute('data-name') || ''; bv = b.getAttribute('data-name') || ''; }
    if (av < bv) return -1 * sortOrder;
    if (av > bv) return 1 * sortOrder;
    return 0;
  });
  var self = this;
  items.forEach(function (it) { self._grid.appendChild(it); });
};

// Patch _dispatch to fan out analytics events (plan §16.25).
var _origDispatch = RepoDeck.prototype._dispatch;
RepoDeck.prototype._dispatch = function (name, detail) {
  _origDispatch.call(this, name, detail);
  var type = name.replace('repodeck:', '');
  emitAnalytics({
    type: type === 'loaded' ? 'viewed' : type === 'modal-open' ? 'modal_open' : type === 'modal-close' ? 'modal_close' : type === 'error' ? 'error' : type,
    name: name,
    owner: this.getAttribute('owner'),
    repo: this.getAttribute('repo'),
    detail: detail || {},
    timestamp: Date.now(),
  });
};

customElements.define('repo-deck', RepoDeck);
if (!customElements.get('repodeck-list')) customElements.define('repodeck-list', RepoDeckList);
}
// ---------------------------------------------------------------------------
// Public exports + window.RepoDeck API surface
// ---------------------------------------------------------------------------

export interface RepoDeckLocaleStrings {
  loading?: string;
  errorTitle?: string;
  viewDetails?: string;
  openOnGithub?: string;
  readmeSection?: string;
  screenshotsSection?: string;
  resumeSection?: string;
  linkSection?: string;
  starsLabel?: string;
  forksLabel?: string;
  noScreenshots?: string;
  readmeUnavailable?: string;
  resumeUnavailable?: string;
  screenshotsUnavailable?: string;
  close?: string;
  closeDialog?: string;
  clickToOpen?: string;
  more?: string;
  [key: string]: string | undefined;
}

export interface RepoDeckAnalyticsEvent {
  type: 'viewed' | 'modal_open' | 'modal_close' | 'error' | string;
  name: string;
  owner: string | null;
  repo: string | null;
  detail: Record<string, unknown>;
  timestamp: number;
}

export type AnalyticsHandler = (event: RepoDeckAnalyticsEvent) => void;

/**
 * Public API. Also available on `window.RepoDeck` when loaded via <script>.
 */
export const RepoDeckAPI = {
  /** Set the active locale. Pass a strings object to register a new locale. */
  setLocale(locale: string, strings?: RepoDeckLocaleStrings): void {
    if (strings) (UI_STRINGS as Record<string, RepoDeckLocaleStrings>)[locale] = { ...(UI_STRINGS[locale] || UI_STRINGS.en), ...strings };
    currentLocale = locale;
    document.querySelectorAll('repo-deck').forEach((el) => {
      const rc = el as RepoDeckElement;
      if (rc._render) rc._render();
    });
  },
  getLocale(): string { return currentLocale; },
  t,
  /** Register an analytics adapter — receives every internal event. */
  createAnalyticsAdapter(handler: AnalyticsHandler): void {
    if (typeof handler === 'function') analyticsHandlers.push(handler);
  },
  removeAnalyticsAdapter(handler: AnalyticsHandler): void {
    const i = analyticsHandlers.indexOf(handler);
    if (i !== -1) analyticsHandlers.splice(i, 1);
  },
  /**
   * Pre-seed CardData so a `<repo-deck data-url="inline">` renders without
   * a `<script>` block. Useful when data is supplied programmatically
   * (e.g. by a framework that imports the data at build time). The data is
   * *expected* to have `meta.owner` and `meta.repo` set; we look those up
   * when deciding whether it applies to a given card.
   */
  provideInlineData(cardData: any): void {
    if (cardData && cardData.meta) {
      _inlineData.manual = cardData;
      var key = cardData.meta.owner + '/' + cardData.meta.repo;
      _setLatestInline(key, cardData);
    }
  },
};

// Expose on window when running in a browser.
if (typeof window !== 'undefined') {
  (window as unknown as { RepoDeck: typeof RepoDeckAPI }).RepoDeck = RepoDeckAPI;
}

export default RepoDeckAPI;
