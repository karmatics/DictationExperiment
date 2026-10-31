class DictationExperiment {
  constructor() {
    this.root = null;
    this.lattice = null;
    this.policy = null;
    this.surface = null;
    this.adapter = null;
    this._timers = [];
    this._statTimer = null;
  }

  async run(env) {
    if (this.root) this.destroy();
    if (!env || !env.container) throw new Error('[DictationExperiment] run() requires env.container');

    const needed = ['DictationLattice', 'DictationPolicy', 'DictationEngineAdapter', 'LatticeSurface', 'DictationDocs'];
    const missing = needed.filter(n => typeof globalThis[n] === 'undefined');
    if (missing.length) {
      env.container.innerHTML = '<div style="padding:24px;font-family:monospace;color:#ff7b72;background:#090d16;height:100vh">' +
        'DictationExperiment: these Library files did not load: <b>' + missing.join(', ') + '</b><br><br>' +
        'Check that Library/&lt;name&gt;.js exists on disk and is listed under "library" in DictationExperiment/luno.json.</div>';
      return this;
    }

    const h = LatticeSurface.h;
    this.lattice = new DictationLattice({ hotMs: 30000, warmMs: 180000 });
    this.policy = new DictationPolicy();
    this.adapter = new DictationEngineAdapter(this.lattice, {
      onStatus: t => { this.status.textContent = t; },
      onStateChange: on => { this.listenBtn.textContent = on ? 'Stop Listening' : 'Start Listening'; }
    });

    const btn = (label, fn, cls = '') => h('button', { className: 'ls-btn ' + cls, onclick: fn }, label);
    this.listenBtn = btn('Start Listening', () => this.toggleListen(), 'pri');
    this.status = h('div', { style: { flex: '1', color: '#94a3b8', fontFamily: 'monospace', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, '🔇 Idle');
    this.stats = h('div', { style: { padding: '6px 12px', borderTop: '1px solid #232d3f', background: '#0a0e1a', color: '#64748b', fontFamily: 'monospace', fontSize: '11px' } });

    const banner = h('div', { style: { padding: '4px 12px', background: '#0b2a1a', color: '#00ff66', fontFamily: 'monospace', fontSize: '11px', borderBottom: '1px solid #14532d' } },
      '✔ DictationExperiment v0.2 — click a word, then type / punctuate / tap Shift. Open 📖 Docs.');

    this.docsPanel = h('div', { style: { position: 'absolute', inset: '0', background: '#090d16', overflow: 'auto', display: 'none', zIndex: '5' } });
    this.docsBtn = btn('📖 Docs', () => this.toggleDocs()),
      btn('🗣️ Vocab', () => this.toggleVocab());

    const bar = h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', padding: '8px 12px', background: '#161e2b', borderBottom: '1px solid #232d3f', flexWrap: 'wrap' } },
      this.listenBtn,
      btn('Demo: U2', () => this.playDemo('u2')),
      btn('Demo: commands', () => this.playDemo('commands')),
      this.status,
      this.docsBtn,
      this.vocabBtn,
      btn('Copy', () => navigator.clipboard.writeText(this.surface.getText())),
      btn('✏️ Raw Edit', () => this.surface && this.surface.toggleRawEdit()),
      btn('Clear', () => { this.cancelDemo(); this.lattice.reset(); })
    );
    const stage = h('div', { style: { flex: '1', minHeight: '0', position: 'relative' } });
    const surfaceHost = h('div', { style: { position: 'absolute', inset: '0' } });
    stage.appendChild(surfaceHost);
    stage.appendChild(this.docsPanel);

    this.root = h('div', { style: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#090d16', color: '#f1f5f9' } }, banner, bar, stage, this.stats);
    env.container.innerHTML = '';
    env.container.style.height = '100vh';
    env.container.appendChild(this.root);

    this.surface = new LatticeSurface(surfaceHost, this.lattice, this.policy);
    this._statTimer = setInterval(() => this.updateStats(), 700);
    this.updateStats();
    return this;
  }


  toggleVocab() {
    const existing = document.getElementById('dict-vocab-dialog');
    if (existing) { existing.remove(); return; }

    const h = LatticeSurface.h;
    const overlay = h('div', {
      id: 'dict-vocab-dialog',
      style: {
        position: 'fixed', top: '60px', right: '20px', width: '380px', maxHeight: '520px',
        background: 'rgba(15, 23, 42, 0.98)', border: '1.5px solid #00f2fe', borderRadius: '12px',
        boxShadow: '0 16px 40px rgba(0,0,0,0.85), 0 0 20px rgba(0,242,254,0.25)',
        padding: '14px', zIndex: '2147483647', fontFamily: 'monospace', color: '#f8fafc',
        display: 'flex', flexDirection: 'column', gap: '10px'
      }
    });

    const header = h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b', paddingBottom: '8px' } },
      h('strong', { style: { color: '#00f2fe', fontSize: '12px' } }, '🗣️ Learned Vocabulary & Replacement Rules'),
      h('button', { className: 'ls-btn', style: { padding: '2px 6px', fontSize: '11px', color: '#ff7b72' }, onclick: () => overlay.remove() }, '✕')
    );
    overlay.appendChild(header);

    const desc = h('div', { style: { fontSize: '10.5px', color: '#94a3b8', lineHeight: '1.4' } },
      'Rules automatically replace engine mishearings. Persisted in localStorage.'
    );
    overlay.appendChild(desc);

    const listContainer = h('div', { style: { flex: 1, maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' } });
    overlay.appendChild(listContainer);

    const renderList = () => {
      listContainer.replaceChildren();
      const rules = Array.from(this.policy.rules.entries());
      if (rules.length === 0) {
        listContainer.appendChild(h('div', { style: { padding: '16px', textAlign: 'center', color: '#64748b', fontStyle: 'italic', fontSize: '11px' } }, 'No rules saved yet. Select a word and click "Always: X → Y" or add below.'));
        return;
      }
      rules.forEach(([heard, write]) => {
        listContainer.appendChild(h('div', {
          style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid #1e293b', borderRadius: '6px', padding: '6px 8px', fontSize: '11px' }
        },
          h('div', {},
            h('span', { style: { color: '#f59e0b' } }, `"${heard}"`),
            h('span', { style: { color: '#64748b', margin: '0 6px' } }, '➔'),
            h('strong', { style: { color: '#00f2fe' } }, `"${write}"`)
          ),
          h('button', {
            style: { background: 'none', border: 'none', color: '#ff7b72', cursor: 'pointer', fontSize: '12px', padding: '0 4px' },
            onclick: () => { this.policy.removeRule(heard); renderList(); this.updateStats(); }
          }, '✕')
        ));
      });
    };
    renderList();

    const addRow = h('div', { style: { display: 'flex', gap: '6px', borderTop: '1px solid #1e293b', paddingTop: '8px' } });
    const inHeard = h('input', { className: 'ls-in', placeholder: 'When heard...', style: { fontSize: '11px' } });
    const inWrite = h('input', { className: 'ls-in', placeholder: 'Write as...', style: { fontSize: '11px' } });
    const btnAdd = h('button', {
      className: 'ls-btn pri', style: { padding: '5px 10px', fontSize: '11px' },
      onclick: () => {
        if (inHeard.value.trim() && inWrite.value.trim()) {
          this.policy.addRule(inHeard.value.trim(), inWrite.value.trim());
          inHeard.value = ''; inWrite.value = '';
          renderList(); this.updateStats();
        }
      }
    }, '+ Add');
    addRow.append(inHeard, inWrite, btnAdd);
    overlay.appendChild(addRow);

    document.body.appendChild(overlay);
  }

  toggleDocs() {
    const open = this.docsPanel.style.display === 'none';
    if (open) DictationDocs.render(this.docsPanel);
    this.docsPanel.style.display = open ? 'block' : 'none';
    this.docsBtn.textContent = open ? '✕ Close Docs' : '📖 Docs';
  }

  toggleListen() {
    if (this.adapter.isListening) this.adapter.stop();
    else this.adapter.start();
  }

  updateStats() {
    const s = this.lattice.stats();
    this.stats.textContent = `spans ${s.spans} (hot ${s.hot} / warm ${s.warm} / cold ${s.cold}) · choice points ${s.choices} · alternatives ${s.alts} · corrections ${s.corrections} · rules ${this.policy.rules.size}   |   click a word (cyan) or boundary (green) to edit · Alt+click to move 🎙️ write head · Ctrl+E for Raw Edit`;
  }

  cancelDemo() { this._timers.forEach(clearTimeout); this._timers = []; }

  playDemo(name) {
    this.cancelDemo();
    const p = 'demo' + Date.now();
    const scripts = {
      u2: [
        [0, `${p}:0`, "I'm going to the YouTube", {}],
        [800, `${p}:0`, "I'm going to the you too", {}],
        [1600, `${p}:0`, "I'm going to the U2 concert", {}],
        [2400, `${p}:0`, "I'm going to the U2 concert tonight", { final: true }],
        [2500, `${p}:0`, "I'm going to the YouTube concert tonight", { asAlt: true }]
      ],
      commands: [
        [0, `${p}:0`, "it's going to be great", {}],
        [800, `${p}:0`, "it's going to be great period new paragraph", {}],
        [1500, `${p}:0`, "it's going to be great period new paragraph", { final: true }],
        [2200, `${p}:1`, "say literal period when you want the word", {}],
        [3000, `${p}:1`, "say literal period when you want the word", { final: true }],
        [3600, `${p}:2`, "i saw you too at the concert", { final: true }]
      ]
    };
    (scripts[name] || []).forEach(([d, key, text, o]) => {
      this._timers.push(setTimeout(() => this.lattice.ingest(key, text, o), d));
    });
  }

  destroy() {
    this.cancelDemo();
    clearInterval(this._statTimer);
    if (this.adapter) this.adapter.destroy();
    if (this.surface) this.surface.destroy();
    if (this.root) this.root.remove();
    this.root = null;
  }
}

globalThis.DictationExperiment = DictationExperiment;
if (typeof module !== 'undefined' && module.exports) module.exports = DictationExperiment;