/**
 * SymGeo Studio Open Ecosystem SDK & Telemetry Event Bus (`src/open-api.js`)
 *
 * Provides:
 * 1. `SymGeoEventBus`: Structured JSON interaction telemetry (`on(type, fn)`, `subscribe(fn)`)
 *    with opt-in, batched Learning Record Store (LRS) webhook delivery.
 * 2. `createSymGeoSDK`: Deterministic programmatic interface (`window.SymGeoCAS`, v3.0.0)
 *    for external learning platforms, automated test suites, and neuro-symbolic AI agents.
 */

export class SymGeoEventBus {
  constructor(options = {}) {
    this.listeners = new Set(); // Set<{ filter: string, fn: Function }>
    this.history = [];
    this.sessionId = `sess_${Date.now().toString(36)}`;
    this.webhook = {
      enabled: Boolean(options.webhookEnabled ?? false),
      endpoint: options.endpoint || '/api/events',
      batchSize: Math.max(1, Number(options.batchSize || 8)),
      queue: []
    };
  }

  configureWebhook({ enabled, endpoint, batchSize } = {}) {
    if (typeof enabled === 'boolean') this.webhook.enabled = enabled;
    if (typeof endpoint === 'string' && endpoint.trim()) this.webhook.endpoint = endpoint.trim();
    if (Number.isFinite(batchSize) && batchSize >= 1) this.webhook.batchSize = Math.floor(batchSize);
    return { ...this.webhook, queueLength: this.webhook.queue.length };
  }

  emit(type, payload = {}) {
    const evt = {
      id: this.history.length + 1,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      timeLabel: new Date().toLocaleTimeString('en-GB', { hour12: false }),
      type,
      payload
    };
    this.history.push(evt);
    if (this.history.length > 500) this.history.shift();

    for (const entry of this.listeners) {
      if (entry.filter === '*' || entry.filter === type) {
        try {
          entry.fn(evt);
        } catch (err) {
          console.error('[SymGeoEventBus listener error]', err);
        }
      }
    }

    if (
      this.webhook.enabled &&
      typeof fetch === 'function' &&
      typeof location !== 'undefined' &&
      String(location.protocol || '').startsWith('http')
    ) {
      this.webhook.queue.push(evt);
      if (this.webhook.queue.length >= this.webhook.batchSize) {
        this.flushWebhook();
      }
    }

    return evt;
  }

  flushWebhook() {
    if (!this.webhook.queue.length || typeof fetch !== 'function') return;
    const batch = this.webhook.queue.splice(0, this.webhook.queue.length);
    fetch(this.webhook.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: this.sessionId, events: batch })
    }).catch(() => {});
  }

  on(typeOrFn, maybeFn) {
    const filter = typeof typeOrFn === 'function' ? '*' : String(typeOrFn || '*');
    const fn = typeof typeOrFn === 'function' ? typeOrFn : maybeFn;
    if (typeof fn !== 'function') return () => {};
    const entry = { filter, fn };
    this.listeners.add(entry);
    return () => this.listeners.delete(entry);
  }

  subscribe(fn) {
    return this.on('*', fn);
  }

  clear() {
    this.history = [];
  }

  getHistory() {
    return [...this.history];
  }
}

export function createSymGeoSDK(bindings) {
  const {
    eventBus,
    setViewMode,
    evalCAS,
    addExpression,
    intersect2D,
    slice3D,
    revolve,
    addCSG,
    exportGLB,
    exportSTL,
    loadScenario,
    getStateSnapshot,
    getLanguage,
    setLanguage
  } = bindings;

  const normalizeMode = (mode) => {
    const m = String(mode || 'split').toLowerCase();
    if (m === 'both' || m === 'split' || m === '2d+3d') return 'split';
    if (m === '3d') return '3d';
    return '2d';
  };

  return {
    version: '3.0.0',
    license: 'GPL-3.0-or-later',
    on: (typeOrFn, maybeFn) => eventBus.on(typeOrFn, maybeFn),
    onEvent: (fn) => eventBus.subscribe(fn),
    configureWebhook: (cfg) => eventBus.configureWebhook(cfg),
    flushWebhook: () => eventBus.flushWebhook(),
    getEventLog: () => eventBus.getHistory(),
    setMode: (mode) => setViewMode(normalizeMode(mode)),
    setViewMode: (mode) => setViewMode(normalizeMode(mode)),
    evalCAS: (cmd) => evalCAS(cmd),
    eval: (cmd) => evalCAS(cmd),
    addExpression: (expr, opts) => addExpression(expr, opts),
    exportState: () => getStateSnapshot(),
    intersect2D,
    slice3D,
    revolve,
    addCSG,
    exportGLB,
    exportSTL,
    loadScenario,
    getLanguage: () => (typeof getLanguage === 'function' ? getLanguage() : 'en'),
    setLanguage: (lang) => (typeof setLanguage === 'function' ? setLanguage(lang) : 'en')
  };
}
