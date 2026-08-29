/**
 * repocard — <repo-card> Custom Element
 *
 * Turns a GitHub repository (that ships a `config-repocard/` folder) into an
 * embeddable card with an expandable modal. Works in any stack (HTML, Vue,
 * Svelte, Angular, React) with zero adapter.
 *
 * Attributes (see plan §6):
 *   owner            (required) GitHub owner
 *   repo             (required) GitHub repo
 *   branch           (default "main")
 *   preset           (default "standard")  minimal | standard | detailed
 *   config-path      (default "config-repocard")
 *   theme            (default "auto")      light | dark | auto
 *   modal-sections   (default "readme,screenshots,link")  ordered, comma list
 *   radius           (default "soft")      sharp | soft | round | <css length>
 *   data-url         (default "/api/repocard/data")  endpoint serving CardData
 *   hide-branding    (optional flag)  hides the small "powered by repocard" link
 *   debug            (optional flag)  verbose console logging
 *
 * Events: repocard:loaded, repocard:error, repocard:modal-open, repocard:modal-close
 *
 * Public methods: openModal(), closeModal()
 * Public API:    window.RepoCard.setLocale, .createAnalyticsAdapter, .t
 */

// --- types (mirrors @repocard/core for self-containment) -------------------

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

/** Minimal interface for the <repo-card> element instance. */
interface RepoCardElement extends HTMLElement {
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

// (The public API is exported at the bottom of this file via RepoCardAPI.)

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

// (The dispatch patch is applied inside the else-if block below, after
//  RepoCard is defined.)

// ---------------------------------------------------------------------------
// --- guard: don't re-define if already loaded ------------------------------

if (typeof customElements !== 'undefined' && customElements.get('repo-card')) {
  // already defined — skip registration (allows safe re-import)
} else if (typeof customElements !== 'undefined') {

// ---------------------------------------------------------------------------
// Small pure helpers — mirror @repocard/core (layout, radius) so the web
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

var STYLES = `
  :host {
    --repocard-bg: #ffffff;
    --repocard-border: #e5e7eb;
    --repocard-text-color: #374151;
    --repocard-title-color: #111827;
    --repocard-muted-color: #6b7280;
    --repocard-accent: #ea580c;
    --repocard-accent-fg: #ffffff;
    --repocard-accent-soft: rgba(234, 88, 12, 0.10);
    --repocard-radius: 14px;
    --repocard-button-radius: 9px;
    --repocard-modal-radius: 18px;
    --repocard-modal-bg: #ffffff;
    --repocard-modal-overlay: rgba(15, 23, 42, 0.55);
    --repocard-shadow: 0 1px 2px rgba(15,23,42,.04), 0 4px 12px rgba(15,23,42,.06);
    --repocard-shadow-hover: 0 4px 12px rgba(15,23,42,.08), 0 20px 44px rgba(15,23,42,.16);

    display: block;
    container-type: inline-size;
    width: 100%;
    max-width: 420px;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--repocard-text-color);
    -webkit-font-smoothing: antialiased;
    line-height: 1.5;
  }
  :host([theme="dark"]) {
    --repocard-bg: #0f172a;
    --repocard-border: #1e293b;
    --repocard-text-color: #cbd5e1;
    --repocard-title-color: #f1f5f9;
    --repocard-muted-color: #94a3b8;
    --repocard-accent-soft: rgba(249, 115, 22, 0.16);
    --repocard-modal-bg: #0f172a;
    --repocard-modal-overlay: rgba(0,0,0,.65);
    --repocard-shadow: 0 1px 2px rgba(0,0,0,.3), 0 4px 12px rgba(0,0,0,.25);
    --repocard-shadow-hover: 0 4px 12px rgba(0,0,0,.35), 0 20px 44px rgba(0,0,0,.45);
  }
  /* auto theme: respect system preference */
  @media (prefers-color-scheme: dark) {
    :host([theme="auto"]) {
      --repocard-bg: #0f172a;
      --repocard-border: #1e293b;
      --repocard-text-color: #cbd5e1;
      --repocard-title-color: #f1f5f9;
      --repocard-muted-color: #94a3b8;
      --repocard-accent-soft: rgba(249, 115, 22, 0.16);
      --repocard-modal-bg: #0f172a;
      --repocard-modal-overlay: rgba(0,0,0,.65);
      --repocard-shadow: 0 1px 2px rgba(0,0,0,.3), 0 4px 12px rgba(0,0,0,.25);
      --repocard-shadow-hover: 0 4px 12px rgba(0,0,0,.35), 0 20px 44px rgba(0,0,0,.45);
    }
  }

  * { box-sizing: border-box; }
  a { color: var(--repocard-accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  img { display: block; max-width: 100%; }

  /* ---------------- Card shell ---------------- */
  .rc-card {
    background: var(--repocard-bg);
    border: 1px solid var(--repocard-border);
    border-radius: var(--repocard-radius);
    box-shadow: var(--repocard-shadow);
    overflow: hidden;
    cursor: pointer;
    transition: box-shadow .25s cubic-bezier(.2,.8,.2,1), transform .25s cubic-bezier(.2,.8,.2,1), border-color .25s ease;
    position: relative;
    display: flex;
    flex-direction: column;
    animation: rc-fade-in .4s ease both;
  }
  .rc-card:hover {
    box-shadow: var(--repocard-shadow-hover);
    transform: translateY(-3px);
    border-color: color-mix(in srgb, var(--repocard-accent) 40%, var(--repocard-border));
  }
  .rc-card:focus-visible { outline: 2px solid var(--repocard-accent); outline-offset: 3px; }
  .rc-card::after {
    content: ''; position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
    box-shadow: inset 0 0 0 1px transparent;
    transition: box-shadow .25s ease;
  }
  .rc-card:hover::after { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--repocard-accent) 18%, transparent); }

  @keyframes rc-fade-in {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* ---------------- Media area (bento) ---------------- */
  .rc-media {
    position: relative;
    background: linear-gradient(135deg, color-mix(in srgb, var(--repocard-accent) 18%, var(--repocard-bg)), color-mix(in srgb, var(--repocard-accent) 6%, var(--repocard-bg)));
    min-height: 152px;
  }
  .rc-tile {
    position: relative;
    overflow: hidden;
    background: var(--repocard-border);
  }
  .rc-tile img {
    width: 100%; height: 100%; object-fit: cover;
    transition: transform .5s cubic-bezier(.2,.8,.2,1), filter .3s ease;
    filter: saturate(.92);
  }
  .rc-card:hover .rc-tile img { transform: scale(1.05); filter: saturate(1); }
  .rc-tile .rc-overflow {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(180deg, rgba(15,23,42,.15), rgba(15,23,42,.65));
    color: #fff;
    font-weight: 700; font-size: 1.15rem;
    letter-spacing: .02em;
    backdrop-filter: blur(3px);
    transition: background .2s ease;
  }
  .rc-tile .rc-overflow::after { content: 'more'; display: block; font-size: .65rem; font-weight: 500; opacity: .8; margin-top: 2px; text-transform: uppercase; letter-spacing: .08em; }
  .rc-card:hover .rc-tile .rc-overflow { background: linear-gradient(180deg, rgba(15,23,42,.25), rgba(15,23,42,.75)); }
  .rc-single {
    position: relative;
    display: flex; align-items: center; justify-content: center;
    min-height: 152px;
  }
  .rc-single img { max-width: 100%; max-height: 300px; width: auto; height: auto; object-fit: contain; transition: transform .5s cubic-bezier(.2,.8,.2,1); }
  .rc-card:hover .rc-single img { transform: scale(1.04); }

  /* fallback cover (no screenshots) */
  .rc-fallback {
    height: 160px;
    display: flex; align-items: center; justify-content: center;
    font-size: 2.6rem; font-weight: 800;
    color: #fff;
    letter-spacing: .03em;
    background: var(--rc-fallback-bg, linear-gradient(135deg, #f97316, #ea580c));
    position: relative;
    overflow: hidden;
  }
  .rc-fallback::before {
    content: ''; position: absolute; inset: 0;
    background: radial-gradient(circle at 30% 20%, rgba(255,255,255,.25), transparent 50%);
    pointer-events: none;
  }
  .rc-fallback::after {
    content: ''; position: absolute; inset: 0;
    background-image: radial-gradient(rgba(255,255,255,.08) 1px, transparent 1px);
    background-size: 14px 14px;
    pointer-events: none;
  }

  /* ---------------- Card body ---------------- */
  .rc-body { padding: 16px 18px 18px; display: flex; flex-direction: column; gap: 10px; }
  .rc-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .rc-titles { min-width: 0; flex: 1; }
  .rc-repo {
    font-size: .68rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
    color: var(--repocard-accent);
    display: inline-flex; align-items: center; gap: 5px;
  }
  .rc-repo::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: var(--repocard-accent); }
  .rc-title {
    font-size: 1.14rem; font-weight: 750; color: var(--repocard-title-color);
    line-height: 1.3; word-break: break-word; margin: 3px 0 0;
    letter-spacing: -0.01em;
  }
  .rc-stat {
    flex: 0 0 auto; font-size: .68rem;
    display: inline-flex; align-items: center; gap: 4px;
    background: var(--repocard-accent-soft); color: var(--repocard-accent);
    padding: 3px 9px; border-radius: 999px; font-weight: 700;
    font-family: ui-monospace, "SF Mono", monospace;
    letter-spacing: .02em;
  }
  .rc-stars {
    flex: 0 0 auto; font-size: .68rem;
    display: inline-flex; align-items: center; gap: 3px;
    background: color-mix(in srgb, #fbbf24 18%, transparent); color: #b45309;
    padding: 3px 8px; border-radius: 999px; font-weight: 700;
    font-family: ui-monospace, "SF Mono", monospace;
  }
  :host([theme="dark"]) .rc-stars, :host([theme="auto"]) .rc-stars { color: #fbbf24; }
  .rc-resume {
    font-size: .86rem; line-height: 1.55; color: var(--repocard-text-color);
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
    margin: 0;
  }
  .rc-resume.rc-truncated::after { content: ' …'; color: var(--repocard-muted-color); }
  .rc-readme-preview {
    font-size: .8rem; color: var(--repocard-muted-color); line-height: 1.5;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    padding: 8px 10px; border-left: 2px solid var(--repocard-accent); background: var(--repocard-accent-soft);
    border-radius: 0 6px 6px 0; margin: 0;
  }
  .rc-foot {
    display: flex; align-items: center; justify-content: space-between;
    margin-top: 4px; gap: 8px;
    padding-top: 8px; border-top: 1px solid color-mix(in srgb, var(--repocard-border) 70%, transparent);
  }
  .rc-hint {
    font-size: .72rem; color: var(--repocard-muted-color);
    display: inline-flex; align-items: center; gap: 5px;
    transition: color .2s ease, gap .2s ease;
  }
  .rc-hint svg { width: 12px; height: 12px; transition: transform .2s ease; }
  .rc-card:hover .rc-hint { color: var(--repocard-accent); gap: 7px; }
  .rc-card:hover .rc-hint svg { transform: translateX(2px); }
  .rc-tag {
    font-size: .62rem; font-weight: 700; text-transform: uppercase; letter-spacing: .08em;
    color: var(--repocard-muted-color);
    border: 1px solid var(--repocard-border);
    padding: 3px 8px; border-radius: 999px;
    background: color-mix(in srgb, var(--repocard-bg) 50%, transparent);
  }

  /* ---------------- States ---------------- */
  .rc-loading, .rc-error {
    padding: 36px 20px; text-align: center; color: var(--repocard-muted-color);
    display: flex; flex-direction: column; align-items: center; gap: 12px; min-height: 200px; justify-content: center;
  }
  .rc-skeleton {
    width: 100%; border-radius: var(--repocard-radius); overflow: hidden;
    background: var(--repocard-bg); border: 1px solid var(--repocard-border);
  }
  .rc-skeleton-media { height: 152px; background: linear-gradient(90deg, var(--repocard-border) 25%, color-mix(in srgb, var(--repocard-border) 60%, var(--repocard-bg)) 50%, var(--repocard-border) 75%); background-size: 200% 100%; animation: rc-shimmer 1.5s infinite; }
  .rc-skeleton-body { padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; }
  .rc-skeleton-line { height: 10px; border-radius: 4px; background: linear-gradient(90deg, var(--repocard-border) 25%, color-mix(in srgb, var(--repocard-border) 60%, var(--repocard-bg)) 50%, var(--repocard-border) 75%); background-size: 200% 100%; animation: rc-shimmer 1.5s infinite; }
  .rc-skeleton-line.w-60 { width: 60%; } .rc-skeleton-line.w-40 { width: 40%; } .rc-skeleton-line.w-80 { width: 80%; }
  @keyframes rc-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  .rc-spinner {
    width: 28px; height: 28px; border-radius: 50%;
    border: 2.5px solid color-mix(in srgb, var(--repocard-accent) 20%, transparent);
    border-top-color: var(--repocard-accent);
    animation: rc-spin .7s linear infinite;
  }
  @keyframes rc-spin { to { transform: rotate(360deg); } }
  .rc-error-icon { width: 32px; height: 32px; color: var(--repocard-muted-color); opacity: .6; }
  .rc-error-title { font-weight: 650; color: var(--repocard-title-color); font-size: .92rem; }
  .rc-error-msg { font-size: .8rem; }
  .rc-error-code { font-size: .68rem; font-family: ui-monospace, monospace; opacity: .6; padding: 2px 8px; border-radius: 4px; background: var(--repocard-accent-soft); color: var(--repocard-accent); }

  /* ---------------- Modal ---------------- */
  .rc-modal-backdrop {
    position: fixed; inset: 0;
    background: var(--repocard-modal-overlay);
    display: none; align-items: center; justify-content: center;
    z-index: 9999; padding: 0;
    opacity: 0; transition: opacity .25s ease;
    backdrop-filter: blur(6px);
  }
  .rc-modal-backdrop[data-open="true"] { display: flex; opacity: 1; }
  .rc-modal {
    background: var(--repocard-modal-bg);
    border: 1px solid var(--repocard-border);
    border-radius: var(--repocard-modal-radius);
    box-shadow: 0 24px 80px rgba(0,0,0,.35);
    width: min(900px, 94vw);
    max-height: 90vh;
    display: flex; flex-direction: column;
    overflow: hidden;
    transform: translateY(12px) scale(.97); transition: transform .28s cubic-bezier(.2,.8,.2,1);
  }
  .rc-modal-backdrop[data-open="true"] .rc-modal { transform: translateY(0) scale(1); }

  .rc-modal-head {
    display: flex; align-items: flex-start; gap: 12px;
    padding: 18px 22px; border-bottom: 1px solid var(--repocard-border);
    position: relative; flex: 0 0 auto;
    background: linear-gradient(180deg, color-mix(in srgb, var(--repocard-accent) 4%, var(--repocard-modal-bg)), var(--repocard-modal-bg));
  }
  .rc-modal-titles { min-width: 0; flex: 1; }
  .rc-modal-repo { font-size: .68rem; color: var(--repocard-accent); font-weight: 700; letter-spacing: .08em; text-transform: uppercase; display: inline-flex; align-items: center; gap: 5px; }
  .rc-modal-repo::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: var(--repocard-accent); }
  .rc-modal-title { font-size: 1.3rem; font-weight: 750; color: var(--repocard-title-color); margin: 4px 0 0; letter-spacing: -0.01em; }
  .rc-modal-sub { font-size: .78rem; color: var(--repocard-muted-color); margin-top: 5px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .rc-modal-sub a { color: var(--repocard-accent); }
  .rc-modal-sub .rc-modal-branch { font-family: ui-monospace, monospace; background: var(--repocard-accent-soft); color: var(--repocard-accent); padding: 1px 7px; border-radius: 4px; font-size: .7rem; font-weight: 600; }
  .rc-modal-close {
    flex: 0 0 auto; cursor: pointer;
    width: 36px; height: 36px; border-radius: 9px; border: 1px solid var(--repocard-border);
    background: transparent; color: var(--repocard-text-color);
    display: inline-flex; align-items: center; justify-content: center;
    transition: background .15s ease, color .15s ease, transform .15s ease;
    font-size: 1rem;
  }
  .rc-modal-close:hover { background: var(--repocard-accent-soft); color: var(--repocard-accent); transform: rotate(90deg); }

  .rc-modal-body { overflow-y: auto; padding: 22px; display: flex; flex-direction: column; gap: 26px; }
  .rc-modal-body::-webkit-scrollbar { width: 8px; }
  .rc-modal-body::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--repocard-muted-color) 40%, transparent); border-radius: 8px; }
  .rc-modal-body::-webkit-scrollbar-track { background: transparent; }
  .rc-section { display: flex; flex-direction: column; gap: 12px; animation: rc-section-in .35s ease both; }
  .rc-section:nth-child(1) { animation-delay: 0s; }
  .rc-section:nth-child(2) { animation-delay: .06s; }
  .rc-section:nth-child(3) { animation-delay: .12s; }
  .rc-section:nth-child(4) { animation-delay: .18s; }
  .rc-section:nth-child(5) { animation-delay: .24s; }
  @keyframes rc-section-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .rc-section-title {
    font-size: .7rem; font-weight: 750; letter-spacing: .1em; text-transform: uppercase;
    color: var(--repocard-muted-color);
    display: flex; align-items: center; gap: 9px;
  }
  .rc-section-title::before { content: ''; width: 16px; height: 2px; background: var(--repocard-accent); border-radius: 2px; }
  .rc-section-title-count { font-size: .62rem; font-weight: 600; opacity: .6; margin-left: 2px; }

  .rc-readme { color: var(--repocard-text-color); font-size: .92rem; line-height: 1.7; overflow-wrap: break-word; }
  .rc-readme h1, .rc-readme h2, .rc-readme h3 { color: var(--repocard-title-color); line-height: 1.25; margin: 1.4em 0 .5em; }
  .rc-readme h1:first-child, .rc-readme h2:first-child, .rc-readme h3:first-child { margin-top: 0; }
  .rc-readme h1 { font-size: 1.45rem; } .rc-readme h2 { font-size: 1.22rem; } .rc-readme h3 { font-size: 1.06rem; }
  .rc-readme p { margin: .7em 0; }
  .rc-readme a { color: var(--repocard-accent); text-decoration: underline; text-underline-offset: 2px; text-decoration-color: color-mix(in srgb, var(--repocard-accent) 35%, transparent); transition: text-decoration-color .15s ease; }
  .rc-readme a:hover { text-decoration-color: var(--repocard-accent); }
  .rc-readme code { font-family: ui-monospace, "SF Mono", monospace; font-size: .85em; background: var(--repocard-accent-soft); color: var(--repocard-accent); padding: .15em .4em; border-radius: 5px; }
  .rc-readme pre { background: color-mix(in srgb, var(--repocard-title-color) 7%, transparent); padding: 14px 16px; border-radius: 10px; overflow-x: auto; border: 1px solid var(--repocard-border); }
  .rc-readme pre code { background: transparent; padding: 0; color: var(--repocard-text-color); }
  .rc-readme img { border-radius: 10px; margin: .7em 0; border: 1px solid var(--repocard-border); }
  .rc-readme ul, .rc-readme ol { padding-left: 1.5em; margin: .7em 0; }
  .rc-readme li { margin: .25em 0; }
  .rc-readme blockquote { border-left: 3px solid var(--repocard-accent); margin: .9em 0; padding: .3em 0 .3em 1.1em; color: var(--repocard-muted-color); background: var(--repocard-accent-soft); border-radius: 0 6px 6px 0; }
  .rc-readme table { border-collapse: collapse; width: 100%; margin: .8em 0; font-size: .88rem; }
  .rc-readme th, .rc-readme td { border: 1px solid var(--repocard-border); padding: 7px 11px; text-align: left; }
  .rc-readme th { background: color-mix(in srgb, var(--repocard-title-color) 4%, transparent); font-weight: 650; }
  .rc-readme hr { border: none; border-top: 1px solid var(--repocard-border); margin: 1.2em 0; }

  .rc-modal-bento { display: grid; grid-template-columns: repeat(4, 1fr); grid-auto-rows: auto; grid-auto-flow: dense; gap: 7px; }
  .rc-modal-bento .rc-tile { border-radius: 10px; cursor: zoom-in; border: 1px solid var(--repocard-border); aspect-ratio: var(--rc-ratio, 16/9); }
  .rc-modal-bento .rc-tile img { transition: transform .35s cubic-bezier(.2,.8,.2,1); }
  .rc-modal-bento .rc-tile:hover img { transform: scale(1.08); }
  .rc-modal-bento .rc-tile::after {
    content: attr(data-filename); position: absolute; left: 0; right: 0; bottom: 0;
    padding: 6px 8px; font-size: .62rem; color: #fff;
    background: linear-gradient(0deg, rgba(0,0,0,.7), transparent);
    opacity: 0; transition: opacity .2s ease; pointer-events: none;
    text-overflow: ellipsis; overflow: hidden; white-space: nowrap;
  }
  .rc-modal-bento .rc-tile:hover::after { opacity: 1; }

  .rc-link-btn {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 11px 20px; border-radius: var(--repocard-button-radius);
    background: var(--repocard-accent); color: var(--repocard-accent-fg);
    font-weight: 650; font-size: .9rem; text-decoration: none; align-self: flex-start;
    transition: filter .15s ease, transform .15s ease, box-shadow .15s ease;
    box-shadow: 0 2px 8px color-mix(in srgb, var(--repocard-accent) 40%, transparent);
  }
  .rc-link-btn:hover { filter: brightness(1.08); text-decoration: none; transform: translateY(-1px); box-shadow: 0 4px 14px color-mix(in srgb, var(--repocard-accent) 50%, transparent); }
  .rc-link-btn svg { width: 14px; height: 14px; }

  .rc-section-error {
    color: var(--repocard-muted-color); font-size: .84rem; padding: 12px 14px;
    border: 1px dashed var(--repocard-border); border-radius: 10px;
    display: flex; align-items: center; gap: 8px;
    background: color-mix(in srgb, var(--repocard-border) 30%, transparent);
  }
  .rc-section-error svg { width: 16px; height: 16px; flex-shrink: 0; opacity: .6; }

  .rc-branding {
    font-size: .68rem; color: var(--repocard-muted-color); text-align: right;
    padding: 11px 22px; border-top: 1px solid var(--repocard-border);
    background: color-mix(in srgb, var(--repocard-title-color) 2%, transparent);
  }
  .rc-branding a { color: var(--repocard-muted-color); text-decoration: none; border-bottom: 1px dotted currentColor; }
  .rc-branding a:hover { color: var(--repocard-accent); }

  /* Lightbox (click a modal screenshot to zoom) */
  .rc-lightbox { position: fixed; inset: 0; background: rgba(0,0,0,.88); display: none; align-items: center; justify-content: center; z-index: 10000; padding: 24px; cursor: zoom-out; opacity: 0; transition: opacity .2s ease; }
  .rc-lightbox[data-open="true"] { display: flex; opacity: 1; }
  .rc-lightbox img { max-width: 95vw; max-height: 92vh; border-radius: 10px; box-shadow: 0 20px 60px rgba(0,0,0,.5); animation: rc-lightbox-in .25s ease both; }
  @keyframes rc-lightbox-in { from { opacity: 0; transform: scale(.95); } to { opacity: 1; transform: scale(1); } }
  .rc-lightbox::after { content: '✕ Close'; position: fixed; top: 20px; right: 24px; color: #fff; font-size: .8rem; opacity: .7; padding: 6px 12px; border: 1px solid rgba(255,255,255,.2); border-radius: 999px; }

  /* ---------------- Responsive (container queries + media fallback) ---------------- */
  @container (max-width: 380px) {
    .rc-modal-bento { grid-template-columns: repeat(2, 1fr); }
    .rc-body { padding: 14px 14px 16px; }
    .rc-title { font-size: 1.04rem; }
  }
  @media (max-width: 480px) {
    .rc-modal-backdrop { align-items: stretch; padding: 0; }
    .rc-modal { width: 100vw; max-height: 100vh; border-radius: 0; border: none; }
    .rc-modal-bento { grid-template-columns: repeat(2, 1fr); }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .001ms !important; transition-duration: .001ms !important; }
  }
`;

// ---------------------------------------------------------------------------
// Element
// ---------------------------------------------------------------------------

function RepoCard() {
  var self = (Reflect && Reflect.construct)
    ? Reflect.construct(HTMLElement, [], RepoCard)
    : HTMLElement.call(this);
  return self;
}

RepoCard.prototype = Object.create(HTMLElement.prototype);
RepoCard.prototype.constructor = RepoCard;

RepoCard.observedAttributes = [
  'owner', 'repo', 'branch', 'ref', 'preset', 'config-path', 'theme',
  'modal-sections', 'radius', 'data-url',
  'hide-branding', 'debug', 'lazy', 'show-stats', 'locale',
];

// Lifecycle -----------------------------------------------------------------

RepoCard.prototype.connectedCallback = function () {
  this._initShadow();
  this._attachThemeWatcher();
  this._debug('mount',
    (this.getAttribute('owner') || '?') + '/' + (this.getAttribute('repo') || '?'),
    'data-url=' + (this.getAttribute('data-url') || '/api/repocard/data'),
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

RepoCard.prototype.disconnectedCallback = function () {
  if (this._themeMql && this._themeMql.removeListener) this._themeMql.removeListener(this._themeHandler);
  if (this._io) { this._io.disconnect(); this._io = null; }
  this._closed = true;
  this._closeModal(true);
};

RepoCard.prototype.attributeChangedCallback = function (name, oldV, newV) {
  if (oldV === newV) return;
  // Theme/radius only re-render (no refetch). The rest refetch.
  if (name === 'theme') { this._applyThemeClass(); this._render(); return; }
  if (name === 'radius') { this._applyRadius(); return; }
  if (name === 'show-stats') { this._render(); return; }
  if (name === 'modal-sections' || name === 'hide-branding') { this._render(); return; }
  if (name === 'locale') { this._render(); return; }
  if (name === 'data-url' || name === 'debug' || name === 'lazy') { return; }
  // owner/repo/branch/ref/preset/config-path → reload.
  if (this._shadowConnected) this._loadData();
};

// Internal ------------------------------------------------------------------

RepoCard.prototype._initShadow = function () {
  if (this._shadowConnected) return;
  this._shadowConnected = true;
  var root = this.attachShadow ? this.attachShadow({ mode: 'open' }) : this.createShadowRoot();
  var style = document.createElement('style');
  style.textContent = STYLES;
  root.appendChild(style);

  var card = document.createElement('article');
  card.className = 'rc-card';
  card.setAttribute('tabindex', '0');
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', 'Repo card — click to open details');
  root.appendChild(card);
  this._cardEl = card;

  var backdrop = document.createElement('div');
  backdrop.className = 'rc-modal-backdrop';
  backdrop.setAttribute('data-open', 'false');
  root.appendChild(backdrop);
  this._backdropEl = backdrop;

  var lightbox = document.createElement('div');
  lightbox.className = 'rc-lightbox';
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

RepoCard.prototype._applyThemeClass = function () {
  if (!this._cardEl) return;
  var theme = this.getAttribute('theme') || 'auto';
  if (theme === 'dark') this.setAttribute('theme', 'dark');
  else if (theme === 'light') this.setAttribute('theme', 'light');
  else this.setAttribute('theme', 'auto');
};

RepoCard.prototype._applyRadius = function () {
  var tokens = resolveRadiusTokens(this.getAttribute('radius'));
  if (!this._shadowConnected) return;
  this.style.setProperty('--repocard-radius', tokens.card);
  this.style.setProperty('--repocard-button-radius', tokens.button);
  this.style.setProperty('--repocard-modal-radius', tokens.modal);
};

RepoCard.prototype._attachThemeWatcher = function () {
  var self = this;
  if (window.matchMedia) {
    this._themeMql = window.matchMedia('(prefers-color-scheme: dark)');
    this._themeHandler = function () { self._render(); };
    if (this._themeMql.addEventListener) this._themeMql.addEventListener('change', this._themeHandler);
    else if (this._themeMql.addListener) this._themeMql.addListener(this._themeHandler);
  }
};

RepoCard.prototype._debug = function () {
  if (!this.hasAttribute('debug')) return;
  var args = Array.prototype.slice.call(arguments);
  console.log.apply(console, ['[repo-card]'].concat(args));
};

RepoCard.prototype._getDataUrl = function () {
  return this.getAttribute('data-url') || '/api/repocard/data';
};

RepoCard.prototype._loadData = function () {
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
  if (this._getDataUrl() === 'github') {
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
  // never in the URL.
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
        self._dispatch('repocard:error', { error: err });
        return;
      }
      self._debug('loaded', 'status=' + r.status, 'cached=' + !!r.json.cached, 'rl=' + r.rate + '/' + r.limit, (Date.now() - t0) + 'ms');
      self._state = { status: 'success', data: r.json.data, cached: !!r.json.cached };
      self._render();
      self._dispatch('repocard:loaded', { data: r.json.data });
    })
    .catch(function (e) {
      if (self._closed) return;
      var err = { code: 'NETWORK_ERROR', message: String(e && e.message || e) };
      self._debug('fetch error', 'network', (Date.now() - t0) + 'ms', err.message);
      self._state = { status: 'error', error: err };
      self._render();
      self._dispatch('repocard:error', { error: err });
    });
};

RepoCard.prototype._dispatch = function (name, detail) {
  this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail: detail || {} }));
};

// Direct-GitHub mode --------------------------------------------------------
// Calls the GitHub REST API from the browser (CORS-permissive). Builds the
// same CardData shape the server endpoint would return. README markdown is
// rendered with a tiny safe inline renderer (escape-first, so no XSS).

RepoCard.prototype._loadDataDirect = function (owner, repo) {
  var self = this;
  var branch = this.getAttribute('branch') || 'main';
  var configPath = (this.getAttribute('config-path') || 'config-repocard').replace(/^\/+|\/+$/g, '');
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

  var tasks = [];
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
    var data = {
      meta: { owner: owner, repo: repo, url: 'https://github.com/' + owner + '/' + repo, branch: branch, configPath: configPath, fetchedAt: Date.now() },
      resume: null, readme: null, screenshots: null,
    };
    results.forEach(function (r) {
      if (r.key === 'resume') {
        data.resume = r.err ? { error: r.err } : directParseResume(r.raw);
      } else if (r.key === 'readme') {
        data.readme = r.err ? { error: r.err } : { html: sanitizeHtml(directMarkdown(r.raw)), raw: r.raw };
      } else if (r.key === 'screenshots') {
        data.screenshots = r.err ? { error: r.err } : directResolveShots(r.entries, owner, repo, branch);
      }
    });
    self._state = { status: 'success', data: data, cached: false, direct: true };
    self._render();
    self._dispatch('repocard:loaded', { data: data });
  }).catch(function (e) {
    if (self._closed) return;
    var err = { code: 'NETWORK_ERROR', message: String(e && e.message || e) };
    self._state = { status: 'error', error: err };
    self._render();
    self._dispatch('repocard:error', { error: err });
  });
};

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

RepoCard.prototype._render = function () {
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
  if (state.status === 'loading') {
    // Skeleton loader — better perceived performance than a bare spinner.
    el.innerHTML =
      '<div class="rc-skeleton">' +
        '<div class="rc-skeleton-media"></div>' +
        '<div class="rc-skeleton-body">' +
          '<div class="rc-skeleton-line w-40"></div>' +
          '<div class="rc-skeleton-line w-80"></div>' +
          '<div class="rc-skeleton-line w-60"></div>' +
        '</div>' +
      '</div>';
    return;
  }
  if (state.status === 'error') {
    var code = state.error.code || 'UNKNOWN';
    var icon = '<svg class="rc-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    el.innerHTML =
      '<div class="rc-error">' +
      icon +
      '<div class="rc-error-title">Could not load this card</div>' +
      '<div class="rc-error-msg">' + escapeHtml(state.error.message || 'Unknown error') + '</div>' +
      '<div class="rc-error-code">' + escapeHtml(code) + '</div>' +
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
};

RepoCard.prototype._renderCardInner = function (data, preset) {
  var meta = data.meta;
  var shots = (!data.screenshots || isFieldError(data.screenshots)) ? [] : data.screenshots;
  var resume = data.resume && !isFieldError(data.resume) ? data.resume : null;
  var readme = data.readme && !isFieldError(data.readme) ? data.readme : null;
  var detailed = preset === 'detailed';
  var minimal = preset === 'minimal';
  var showStats = this.hasAttribute('show-stats');
  var stats = data.stats && !isFieldError(data.stats) ? data.stats : null;

  // Frontmatter override (plan §16.18): per-project accent color + title.
  var fm = data.readme && !isFieldError(data.readme) && readme.frontmatter ? readme.frontmatter : null;
  var displayTitle = (fm && fm.title) ? fm.title : meta.repo;
  if (fm && isValidHexColor(fm.accent)) {
    this.style.setProperty('--repocard-accent', fm.accent.trim());
    this.style.setProperty('--repocard-accent-soft', hexToRgba(fm.accent, 0.12));
  }

  var media = '';
  var layout = resolveScreenshotLayout(shots, 'card');
  if (shots.length === 0) {
    var initials = (displayTitle || '?').replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'RC';
    var hue = hashHue(meta.owner + '/' + meta.repo);
    media = '<div class="rc-fallback" style="--rc-fallback-bg: linear-gradient(135deg, hsl(' + hue + ',70%,55%), hsl(' + ((hue + 40) % 360) + ',70%,45%))">' + escapeHtml(initials) + '</div>';
  } else {
    var it = layout.items[0];
    media = '<div class="rc-single"><img src="' + escapeHtml(it.screenshot.url) + '" alt="' + escapeHtml(it.screenshot.alt) + '" loading="lazy" />' +
      (it.overflow ? '<div class="rc-overflow">+' + it.overflow + '</div>' : '') + '</div>';
  }

  var body = '';
  // Head: owner/repo + badges
  var badges = '<span class="rc-stat" title="Branch">' + escapeHtml(meta.branch) + '</span>';
  if (showStats && stats && typeof stats.stars === 'number') {
    badges = '<span class="rc-stars" title="' + stats.stars + ' ' + t('starsLabel') + '"><svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>' + formatCount(stats.stars) + '</span>' + badges;
  }
  body += '<div class="rc-head"><div class="rc-titles">' +
    '<div class="rc-repo">' + escapeHtml(meta.owner) + '</div>' +
    '<div class="rc-title">' + escapeHtml(displayTitle) + '</div>' +
    '</div><div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">' + badges + '</div></div>';

  // Resume: hidden on minimal preset (plan §4).
  if (!minimal) {
    if (resume && resume.text) {
      body += '<p class="rc-resume' + (resume.truncated ? ' rc-truncated' : '') + '">' + escapeHtml(resume.text) + '</p>';
    } else if (data.resume && isFieldError(data.resume)) {
      body += '<p class="rc-resume" style="opacity:.55;font-style:italic">' + t('resumeUnavailable') + '</p>';
    }
  }

  if (detailed && readme && readme.raw) {
    var preview = stripMd(readme.raw).slice(0, 140);
    if (preview) body += '<p class="rc-readme-preview">' + escapeHtml(preview) + '…</p>';
  }

  // Foot: hint with arrow + preset tag
  var arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
  body += '<div class="rc-foot">' +
    '<span class="rc-hint">' + t('viewDetails') + ' ' + arrow + '</span>' +
    '<span class="rc-tag">' + escapeHtml(preset) + '</span>' +
    '</div>';

  return '<div class="rc-media">' + media + '</div><div class="rc-body">' + body + '</div>';
};

// Modal ---------------------------------------------------------------------

RepoCard.prototype.openModal = function () {
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
    statsHtml = '<span class="rc-modal-branch" style="background:color-mix(in srgb,#fbbf24 18%,transparent);color:#b45309"><svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" style="vertical-align:-1px"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg> ' + formatCount(stats.stars) + ' stars</span>';
  }
  if (stats && typeof stats.forks === 'number') {
    statsHtml += '<span class="rc-modal-branch"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:-1px"><circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M18 8v2c0 1.5-.5 2-2 2H8c-1.5 0-2 .5-2 2"/></svg> ' + formatCount(stats.forks) + ' forks</span>';
  }
  var head =
    '<div class="rc-modal-titles">' +
    '<div class="rc-modal-repo">' + escapeHtml(meta.owner) + '</div>' +
    '<div class="rc-modal-title">' + escapeHtml(meta.repo) + '</div>' +
    '<div class="rc-modal-sub"><a href="' + escapeHtml(meta.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(meta.url) + '</a> <span class="rc-modal-branch">' + escapeHtml(meta.branch) + '</span>' + statsHtml + '</div>' +
    '</div>' +
    '<button class="rc-modal-close" aria-label="' + t('closeDialog') + '" data-close>✕</button>';

  var bodyHtml = sections.map(function (sec) { return self._renderModalSection(sec, data); }).join('');

  var branding = this.hasAttribute('hide-branding') ? '' :
    '<div class="rc-branding">powered by <a href="https://github.com" target="_blank" rel="noopener noreferrer">repocard</a></div>';

  backdrop.innerHTML =
    '<div class="rc-modal" role="dialog" aria-modal="true" aria-label="' + escapeHtml(meta.owner + '/' + meta.repo) + ' details">' +
    '<div class="rc-modal-head">' + head + '</div>' +
    '<div class="rc-modal-body">' + bodyHtml + '</div>' +
    branding +
    '</div>';

  backdrop.setAttribute('data-open', 'true');
  document.body.style.overflow = 'hidden';

  // Wire close button
  backdrop.querySelector('[data-close]').addEventListener('click', function () { self.closeModal(); });
  this._applyTileRatios(backdrop);

  // Focus trap + ESC
  this._modalKeyHandler = function (e) {
    if (e.key === 'Escape') { e.preventDefault(); self.closeModal(); return; }
    if (e.key === 'Tab') { self._trapFocus(e); }
  };
  backdrop.addEventListener('keydown', this._modalKeyHandler);

  // Wire screenshot zoom
  var tiles = backdrop.querySelectorAll('.rc-modal-bento .rc-tile, .rc-single-modal .rc-tile');
  tiles.forEach(function (tile) {
    tile.addEventListener('click', function () {
      var img = tile.querySelector('img');
      if (!img) return;
      self._lightboxEl.innerHTML = '<img src="' + img.src + '" alt="' + (img.getAttribute('alt') || '') + '" />';
      self._lightboxEl.setAttribute('data-open', 'true');
    });
  });

  // Move focus into modal
  var focusable = backdrop.querySelector('a, button, [tabindex]');
  if (focusable) setTimeout(function () { focusable.focus(); }, 30);

  this._dispatch('repocard:modal-open', { data: data });
};

RepoCard.prototype._renderModalSection = function (section, data) {
  var errIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
  if (section === 'readme') {
    var readme = data.readme;
    if (!readme) return '';
    if (isFieldError(readme)) {
      return '<section class="rc-section"><div class="rc-section-title">' + t('readmeSection') + '</div><div class="rc-section-error">' + errIcon + t('readmeUnavailable') + '</div></section>';
    }
    return '<section class="rc-section"><div class="rc-section-title">' + t('readmeSection') + '</div><div class="rc-readme">' + sanitizeHtml(readme.html) + '</div></section>';
  }
  if (section === 'screenshots') {
    var shots = data.screenshots;
    if (!shots) return '';
    if (isFieldError(shots)) {
      return '<section class="rc-section"><div class="rc-section-title">' + t('screenshotsSection') + '</div><div class="rc-section-error">' + errIcon + t('screenshotsUnavailable') + '</div></section>';
    }
    if (shots.length === 0) {
      return '<section class="rc-section"><div class="rc-section-title">' + t('screenshotsSection') + '</div><div class="rc-section-error">' + errIcon + t('noScreenshots') + '</div></section>';
    }
    var layout = resolveScreenshotLayout(shots, 'modal');
    var grid = layout.items.map(function (it) {
      return '<div class="rc-tile' + (it.hero ? ' hero' : '') + '" data-filename="' + escapeHtml(it.screenshot.filename) + '" style="--cspan:' + it.colSpan + ';--rspan:' + it.rowSpan + '" tabindex="0" role="button" aria-label="Zoom screenshot ' + escapeHtml(it.screenshot.alt) + '">' +
        '<img src="' + escapeHtml(it.screenshot.url) + '" alt="' + escapeHtml(it.screenshot.alt) + '" loading="lazy" />' +
        '</div>';
    }).join('');
    return '<section class="rc-section"><div class="rc-section-title">' + t('screenshotsSection') + '<span class="rc-section-title-count">' + shots.length + '</span></div><div class="rc-modal-bento">' + grid + '</div></section>';
  }
  if (section === 'resume') {
    var resume = data.resume;
    if (!resume) return '';
    if (isFieldError(resume)) {
      return '<section class="rc-section"><div class="rc-section-title">' + t('resumeSection') + '</div><div class="rc-section-error">' + errIcon + t('resumeUnavailable') + '</div></section>';
    }
    return '<section class="rc-section"><div class="rc-section-title">' + t('resumeSection') + '</div><p style="margin:0;color:var(--repocard-text-color);line-height:1.7;font-size:.92rem">' + escapeHtml(resume.text) + '</p></section>';
  }
  if (section === 'link') {
    var meta = data.meta;
    var extIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
    return '<section class="rc-section"><div class="rc-section-title">' + t('linkSection') + '</div>' +
      '<a class="rc-link-btn" href="' + escapeHtml(meta.url) + '" target="_blank" rel="noopener noreferrer">' + t('openOnGithub') + ' ' + extIcon + '</a>' +
      '</section>';
  }
  return '';
};

RepoCard.prototype.closeModal = function () { this._closeModal(false); };
RepoCard.prototype._closeModal = function (silent) {
  if (!this._modalOpen) return;
  this._debug('modal', 'close');
  this._modalOpen = false;
  var backdrop = this._backdropEl;
  backdrop.setAttribute('data-open', 'false');
  backdrop.innerHTML = '';
  if (this._modalKeyHandler) {
    backdrop.removeEventListener('keydown', this._modalKeyHandler);
    this._modalKeyHandler = null;
  }
  document.body.style.overflow = '';
  if (this._lastFocused && this._lastFocused.focus) this._lastFocused.focus();
  if (!silent) this._dispatch('repocard:modal-close', {});
};

RepoCard.prototype._trapFocus = function (e) {
  var modal = this._backdropEl.querySelector('.rc-modal');
  if (!modal) return;
  var focusable = modal.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input, textarea, select');
  if (focusable.length === 0) return;
  var first = focusable[0];
  var last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
};

// Public alias for plan §6 `renderModalSections`.
RepoCard.prototype.renderModalSections = function (data, sections) {
  var self = this;
  return sections.map(function (s) { return self._renderModalSection(s, data); }).join('');
};

// Helpers -------------------------------------------------------------------

function hashHue(str) {
  var h = 0;
  for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}

/** Modal: apply each screenshot's natural aspect ratio to its tile so object-fit never crops. */
RepoCard.prototype._applyTileRatios = function (root) {
  var imgs = root ? root.querySelectorAll('.rc-tile img') : [];
  for (var i = 0; i < imgs.length; i++) {
    (function (img) {
      function apply() {
        var tile = img.parentElement;
        if (!tile || !img.naturalWidth || !img.naturalHeight) return;
        tile.style.setProperty('--rc-ratio', img.naturalWidth + ' / ' + img.naturalHeight);
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

// Frontmatter accent comes from a third-party repo — only accept strict hex
// so the value is never treated as an arbitrary CSS token stream (which could
// smuggle a url() into background for tracking/exfiltration).
function isValidHexColor(v) {
  return typeof v === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim());
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

// <repocard-list> — a portfolio grid component (plan §16.21).
// Receives a comma-separated `repos="owner/repo,owner/repo"` list and renders
// coordinated <repo-card> children with consistent spacing + staggered
// lazy-loading to avoid thundering-herd rate-limit consumption.
// ---------------------------------------------------------------------------

function RepoCardList() {
  var self = (Reflect && Reflect.construct)
    ? Reflect.construct(HTMLElement, [], RepoCardList)
    : HTMLElement.call(this);
  return self;
}
RepoCardList.prototype = Object.create(HTMLElement.prototype);
RepoCardList.prototype.constructor = RepoCardList;

RepoCardList.observedAttributes = ['repos', 'preset', 'theme', 'radius', 'cols', 'gap', 'lazy', 'show-stats', 'data-url', 'modal-sections', 'config-path', 'sort', 'sort-order', 'locale', 'batch-check', 'filter-tag'];

RepoCardList.prototype.connectedCallback = function () {
  this._renderList();
};

/** Batch rate-limit check (plan §16.22). Before rendering N cards, ask the
 *  batch-check endpoint whether the rate-limit budget can absorb the load.
 *  If not, stagger the card loads by `suggestedDelayMs`. */
RepoCardList.prototype._performBatchCheck = function (count, cb) {
  var self = this;
  if (!this.hasAttribute('batch-check') || !this.getAttribute('data-url') || this.getAttribute('data-url') === 'github') {
    cb(0);
    return;
  }
  var baseUrl = this.getAttribute('data-url') || '';
  // Derive the batch-check URL from the data-url (same /api/repocard/ prefix).
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

RepoCardList.prototype.attributeChangedCallback = function (name, oldV, newV) {
  if (oldV === newV) return;
  // filter-tag changes only re-filter, not re-render (avoids reloading cards).
  if (name === 'filter-tag' && this._connected) {
    this._maybeFilter();
    return;
  }
  if (this._connected) this._renderList();
};

RepoCardList.prototype._renderList = function () {
  this._connected = true;
  var self = this;
  var reposAttr = this.getAttribute('repos') || '';
  var repos = reposAttr.split(',').map(function (s) { return s.trim(); }).filter(Boolean).map(function (s) {
    var parts = s.split('/');
    return { owner: parts[0], repo: parts.slice(1).join('/') };
  }).filter(function (r) { return r.owner && r.repo; });

  // Shared attributes to forward to each child <repo-card>.
  var sharedAttrs = ['preset', 'theme', 'radius', 'data-url', 'modal-sections', 'config-path'];
  var boolAttrs = ['lazy', 'show-stats'];

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
        notice.className = 'rc-list-notice';
        notice.style.cssText = 'grid-column:1/-1;text-align:center;padding:8px;font-size:.72rem;color:#6b7280;background:rgba(245,158,11,.1);border-radius:8px;margin-bottom:8px;';
        notice.textContent = 'Rate limit low — staggering card loads by ' + Math.round(delayMs / 1000) + 's to avoid failures.';
        self._grid.insertBefore(notice, self._grid.firstChild);
      }
    });
  }

  // Build the shadow root with a grid container.
  if (!this._shadowRoot) {
    this._shadowRoot = this.attachShadow ? this.attachShadow({ mode: 'open' }) : this.createShadowRoot();
    var style = document.createElement('style');
    style.textContent = [
      ':host { display: block; }',
      '.rc-list { display: grid; gap: ' + gap + '; grid-template-columns: repeat(' + (cols === 'auto' ? 'auto-fill' : cols) + ', minmax(280px, 1fr)); }',
      '.rc-list-item { animation: rc-list-in .4s ease both; }',
      '.rc-list-item:nth-child(1) { animation-delay: 0s; }',
      '.rc-list-item:nth-child(2) { animation-delay: .06s; }',
      '.rc-list-item:nth-child(3) { animation-delay: .12s; }',
      '.rc-list-item:nth-child(4) { animation-delay: .18s; }',
      '.rc-list-item:nth-child(5) { animation-delay: .24s; }',
      '.rc-list-item:nth-child(6) { animation-delay: .30s; }',
      '.rc-list-item:nth-child(7) { animation-delay: .36s; }',
      '.rc-list-item:nth-child(8) { animation-delay: .42s; }',
      '.rc-list-empty { grid-column: 1 / -1; text-align: center; padding: 40px; color: #6b7280; font-size: .9rem; }',
      '@keyframes rc-list-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }',
      '@media (max-width: 640px) { .rc-list { grid-template-columns: 1fr; } }',
      '@media (prefers-reduced-motion: reduce) { .rc-list-item { animation: none !important; } }',
    ].join('\n');
    this._shadowRoot.appendChild(style);
    this._grid = document.createElement('div');
    this._grid.className = 'rc-list';
    this._shadowRoot.appendChild(this._grid);
  }

  this._grid.innerHTML = '';

  if (repos.length === 0) {
    this._grid.innerHTML = '<div class="rc-list-empty">No repos configured. Add <code>repos="owner/repo,owner/repo"</code> to the &lt;repocard-list&gt; element.</div>';
    return;
  }

  var sortBy = this.getAttribute('sort') || 'none'; // none | order | stars | name
  var sortOrder = this.getAttribute('sort-order') || 'asc'; // asc | desc

  repos.forEach(function (r, i) {
    var wrapper = document.createElement('div');
    wrapper.className = 'rc-list-item';
    wrapper.setAttribute('data-index', String(i));
    var card = document.createElement('repo-card');
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
    card.addEventListener('repocard:loaded', function () {
      var data = card._state && card._state.data;
      if (!data) return;
      var fm = data.readme && !isFieldError(data.readme) && data.readme.frontmatter ? data.readme.frontmatter : null;
      var order = fm && typeof fm.order === 'number' ? fm.order : 999;
      var stars = data.stats && !isFieldError(data.stats) && typeof data.stats.stars === 'number' ? data.stats.stars : 0;
      var name = r.repo.toLowerCase();
      var tags = fm && typeof fm.tags === 'string' ? fm.tags : '';
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
RepoCardList.prototype._maybeFilter = function () {
  var filterTag = (this.getAttribute('filter-tag') || '').trim().toLowerCase();
  var items = this._grid.querySelectorAll('.rc-list-item');
  var visibleCount = 0;
  items.forEach(function (it) {
    var tags = it.getAttribute('data-tags') || '';
    var matches = !filterTag || tags.split(',').map(function (t) { return t.trim(); }).indexOf(filterTag) !== -1;
    it.style.display = matches ? '' : 'none';
    if (matches) visibleCount++;
  });
  // Show/hide empty state.
  var empty = this._grid.querySelector('.rc-list-empty-filter');
  if (visibleCount === 0 && filterTag) {
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'rc-list-empty-filter rc-list-empty';
      empty.textContent = 'No repos match the tag "' + filterTag + '".';
      this._grid.appendChild(empty);
    }
  } else if (empty) {
    empty.remove();
  }
};

/** Re-sorts the grid items by the active sort key. Called as each card
 * reports its loaded data. Only re-orders when all cards have reported. */
RepoCardList.prototype._maybeSort = function () {
  var sortBy = this.getAttribute('sort') || 'none';
  if (sortBy === 'none') return;
  var items = Array.prototype.slice.call(this._grid.querySelectorAll('.rc-list-item'));
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
var _origDispatch = RepoCard.prototype._dispatch;
RepoCard.prototype._dispatch = function (name, detail) {
  _origDispatch.call(this, name, detail);
  var type = name.replace('repocard:', '');
  emitAnalytics({
    type: type === 'loaded' ? 'viewed' : type === 'modal-open' ? 'modal_open' : type === 'modal-close' ? 'modal_close' : type === 'error' ? 'error' : type,
    name: name,
    owner: this.getAttribute('owner'),
    repo: this.getAttribute('repo'),
    detail: detail || {},
    timestamp: Date.now(),
  });
};

customElements.define('repo-card', RepoCard);
if (!customElements.get('repocard-list')) customElements.define('repocard-list', RepoCardList);
}
// ---------------------------------------------------------------------------
// Public exports + window.RepoCard API surface
// ---------------------------------------------------------------------------

export interface RepoCardLocaleStrings {
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

export interface RepoCardAnalyticsEvent {
  type: 'viewed' | 'modal_open' | 'modal_close' | 'error' | string;
  name: string;
  owner: string | null;
  repo: string | null;
  detail: Record<string, unknown>;
  timestamp: number;
}

export type AnalyticsHandler = (event: RepoCardAnalyticsEvent) => void;

/**
 * Public API. Also available on `window.RepoCard` when loaded via <script>.
 */
export const RepoCardAPI = {
  /** Set the active locale. Pass a strings object to register a new locale. */
  setLocale(locale: string, strings?: RepoCardLocaleStrings): void {
    if (strings) (UI_STRINGS as Record<string, RepoCardLocaleStrings>)[locale] = { ...(UI_STRINGS[locale] || UI_STRINGS.en), ...strings };
    currentLocale = locale;
    document.querySelectorAll('repo-card').forEach((el) => {
      const rc = el as RepoCardElement;
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
};

// Expose on window when running in a browser.
if (typeof window !== 'undefined') {
  (window as unknown as { RepoCard: typeof RepoCardAPI }).RepoCard = RepoCardAPI;
}

export default RepoCardAPI;
