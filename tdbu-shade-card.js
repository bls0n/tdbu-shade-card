class TdbuShadeCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._topPos = 0;
    this._btmPos = 0;
    this._drag = null;
    this._startY = 0;
    this._startPos = 0;
    this._rendered = false;
  }

  setConfig(config) {
    if (!config.entity_top || !config.entity_bottom) {
      throw new Error('tdbu-shade-card requires entity_top and entity_bottom');
    }
    this._config = {
      name: config.name || 'Shade',
      entity_top: config.entity_top,
      entity_bottom: config.entity_bottom,
      presets: config.presets || [
        { name: 'wake', top: 0, bottom: 0 },
        { name: 'sleep', top: 0, bottom: 100 },
      ],
    };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._rendered) return;
    if (this._drag) return;

    const stTop = hass.states[this._config.entity_top];
    const stBtm = hass.states[this._config.entity_bottom];
    if (!stTop || !stBtm) return;

    const haTop = parseFloat(stTop.attributes.current_position ?? 100);
    const haBtm = parseFloat(stBtm.attributes.current_position ?? 100);

    this._topPos = (100 - haTop) / 100;
    this._btmPos = (100 - haBtm) / 100;
    this._updateVisuals();
  }

  _haPositionFromPos(pos) {
    return Math.round((1 - pos) * 100);
  }

  _callService(entityId, haPosition) {
    if (!this._hass) return;
    this._hass.callService('cover', 'set_cover_position', {
      entity_id: entityId,
      position: haPosition,
    });
  }

  _clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  _getY(e) { return e.touches ? e.touches[0].clientY : e.clientY; }

  _render() {
    const presetButtons = (this._config.presets || [])
      .map(p => `<button class="preset-btn" data-top="${p.top}" data-btm="${p.bottom}">${p.name}</button>`)
      .join('');

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: var(--primary-font-family, sans-serif);
        }
        .card {
          background: var(--card-background-color, #fff);
          border-radius: var(--ha-card-border-radius, 12px);
          box-shadow: var(--ha-card-box-shadow, 0 2px 8px rgba(0,0,0,0.1));
          padding: 16px 20px;
          user-select: none;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .name {
          font-size: 15px;
          font-weight: 500;
          color: var(--primary-text-color, #212121);
        }
        .status {
          font-size: 12px;
          color: var(--secondary-text-color, #757575);
        }
        .body {
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }
        .rail-label {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding-top: 4px;
          min-width: 36px;
        }
        .rail-label span {
          font-size: 11px;
          color: var(--secondary-text-color, #757575);
        }
        .rail-pct {
          font-size: 13px;
          font-weight: 500;
          color: var(--primary-text-color, #212121);
        }
        .rail-icon {
          font-size: 16px;
          color: var(--secondary-text-color, #757575);
        }
        .window {
          flex: 1;
          position: relative;
          height: 260px;
          border: 2px solid var(--divider-color, #e0e0e0);
          border-radius: 4px;
          overflow: hidden;
        }
        .clear-top, .clear-bottom {
          position: absolute;
          left: 0; right: 0;
          background: var(--secondary-background-color, #f5f5f5);
        }
        .clear-top { top: 0; }
        .clear-bottom { bottom: 0; }
        .fabric {
          position: absolute;
          left: 0; right: 0;
          background: var(--state-cover-active-color, #B5D4F4);
        }
        .rail {
          position: absolute;
          left: 0; right: 0;
          height: 10px;
          background: var(--primary-color, #185FA5);
          border-radius: 2px;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 6px;
          pointer-events: none;
        }
        .rail-tag {
          font-size: 9px;
          color: rgba(255,255,255,0.85);
          font-weight: 500;
          letter-spacing: 0.02em;
        }
        .rail-grip {
          width: 20px;
          height: 3px;
          background: rgba(255,255,255,0.4);
          border-radius: 2px;
        }
        .hit-zone {
          position: absolute;
          left: 0; right: 0;
          cursor: ns-resize;
          z-index: 20;
        }
        .presets {
          display: flex;
          gap: 8px;
          margin-top: 12px;
          flex-wrap: wrap;
        }
        .preset-btn {
          flex: 1;
          min-width: 0;
          font-size: 12px;
          padding: 6px 4px;
          border: 1px solid var(--divider-color, #e0e0e0);
          border-radius: 6px;
          background: var(--secondary-background-color, #f5f5f5);
          color: var(--primary-text-color, #212121);
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s;
        }
        .preset-btn:hover {
          background: var(--primary-color, #185FA5);
          color: #fff;
          border-color: var(--primary-color, #185FA5);
        }
        .preset-btn:active {
          opacity: 0.85;
          transform: scale(0.97);
        }
      </style>

      <ha-card>
        <div class="card">
          <div class="header">
            <span class="name">${this._config.name}</span>
            <span class="status" id="status">open</span>
          </div>
          <div class="body">
            <div class="rail-label">
              <span class="rail-icon">▲</span>
              <span>top</span>
              <span class="rail-pct" id="top-pct">0%</span>
            </div>
            <div class="window" id="window">
              <div class="clear-top" id="clear-top"></div>
              <div class="fabric" id="fabric"></div>
              <div class="clear-bottom" id="clear-bottom"></div>
              <div class="rail" id="top-rail">
                <span class="rail-tag">TOP</span>
                <div class="rail-grip"></div>
              </div>
              <div class="rail" id="btm-rail">
                <div class="rail-grip"></div>
                <span class="rail-tag">BTM</span>
              </div>
              <div class="hit-zone" id="top-upper" style="z-index:32;"></div>
              <div class="hit-zone" id="top-hit" style="z-index:30;"></div>
              <div class="hit-zone" id="btm-hit" style="z-index:31;"></div>
            </div>
            <div class="rail-label">
              <span class="rail-icon">▼</span>
              <span>bottom</span>
              <span class="rail-pct" id="btm-pct">0%</span>
            </div>
          </div>
          <div class="presets">
            ${presetButtons}
          </div>
        </div>
      </ha-card>
    `;

    this._rendered = true;
    this._bindEvents();
    this._updateVisuals();
  }

  _bindEvents() {
    const RAIL_H = 10;
    const PAD = 24;
    const MIN_GAP = 0.04;

    const win = this.shadowRoot.getElementById('window');
    const topUpper = this.shadowRoot.getElementById('top-upper');
    const topHit = this.shadowRoot.getElementById('top-hit');
    const btmHit = this.shadowRoot.getElementById('btm-hit');

    const startDrag = (which, e) => {
      this._drag = which;
      this._startY = this._getY(e);
      this._startPos = which === 'top' ? this._topPos : this._btmPos;
      e.preventDefault();
    };

    topUpper.addEventListener('mousedown', e => startDrag('top', e));
    topHit.addEventListener('mousedown', e => startDrag('top', e));
    btmHit.addEventListener('mousedown', e => startDrag('btm', e));
    topUpper.addEventListener('touchstart', e => startDrag('top', e), { passive: false });
    topHit.addEventListener('touchstart', e => startDrag('top', e), { passive: false });
    btmHit.addEventListener('touchstart', e => startDrag('btm', e), { passive: false });

    const onMove = (e) => {
      if (!this._drag) return;
      const h = win.offsetHeight;
      const d = (this._getY(e) - this._startY) / h;
      if (this._drag === 'top') {
        this._topPos = this._clamp(this._startPos + d, 0, this._btmPos - MIN_GAP);
      } else {
        this._btmPos = this._clamp(this._startPos + d, this._topPos + MIN_GAP, 1 - RAIL_H / h);
      }
      this._updateVisuals();
    };

    const onUp = () => {
      if (!this._drag) return;
      if (this._drag === 'top') {
        this._callService(this._config.entity_top, this._haPositionFromPos(this._topPos));
      } else {
        this._callService(this._config.entity_bottom, this._haPositionFromPos(this._btmPos));
      }
      this._drag = null;
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);

    this.shadowRoot.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = parseFloat(btn.dataset.top) / 100;
        const b = parseFloat(btn.dataset.btm) / 100;
        this._topPos = t;
        this._btmPos = b;
        this._updateVisuals();
        this._callService(this._config.entity_top, this._haPositionFromPos(t));
        this._callService(this._config.entity_bottom, this._haPositionFromPos(b));
      });
    });
  }

  _updateVisuals() {
    if (!this._rendered) return;
    const win = this.shadowRoot.getElementById('window');
    const h = win.offsetHeight;
    if (!h) return;

    const RAIL_H = 10;
    const PAD = 24;

    const topY = Math.round(this._topPos * h);
    const btmY = Math.round(this._clamp(this._btmPos * h, 0, h - RAIL_H));

    this.shadowRoot.getElementById('top-rail').style.top = topY + 'px';
    this.shadowRoot.getElementById('btm-rail').style.top = btmY + 'px';
    this.shadowRoot.getElementById('clear-top').style.height = topY + 'px';
    this.shadowRoot.getElementById('clear-bottom').style.height = (h - btmY - RAIL_H) + 'px';

    const fab = this.shadowRoot.getElementById('fabric');
    fab.style.top = (topY + RAIL_H) + 'px';
    fab.style.height = Math.max(0, btmY - topY - RAIL_H) + 'px';

    const topPct = Math.round(this._topPos * 100);
    const btmPct = Math.round(this._btmPos * 100);
    this.shadowRoot.getElementById('top-pct').textContent = topPct + '%';
    this.shadowRoot.getElementById('btm-pct').textContent = btmPct + '%';

    const status = this.shadowRoot.getElementById('status');
    if (topPct < 5 && btmPct < 5) status.textContent = 'open';
    else if (topPct < 5 && btmPct > 90) status.textContent = 'closed';
    else status.textContent = 'partial';

    const topCenter = topY + RAIL_H / 2;
    const btmCenter = btmY + RAIL_H / 2;
    const midpoint = (topCenter + btmCenter) / 2;

    const topUpper = this.shadowRoot.getElementById('top-upper');
    const upperTop = Math.max(0, topCenter - PAD);
    topUpper.style.top = upperTop + 'px';
    topUpper.style.height = Math.max(0, topCenter - upperTop) + 'px';

    const topHit = this.shadowRoot.getElementById('top-hit');
    topHit.style.top = topCenter + 'px';
    topHit.style.height = Math.max(0, midpoint - topCenter) + 'px';

    const btmHit = this.shadowRoot.getElementById('btm-hit');
    btmHit.style.top = midpoint + 'px';
    btmHit.style.height = Math.max(0, Math.min(h, btmCenter + PAD) - midpoint) + 'px';
  }

  getCardSize() { return 4; }

  static getConfigElement() {
    return document.createElement('tdbu-shade-card-editor');
  }

  static getStubConfig() {
    return {
      entity_top: 'cover.shade_top_rail',
      entity_bottom: 'cover.shade_bottom_rail',
      name: 'Shade',
      presets: [
        { name: 'wake', top: 0, bottom: 0 },
        { name: 'sleep', top: 0, bottom: 100 },
      ],
    };
  }
}

customElements.define('tdbu-shade-card', TdbuShadeCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'tdbu-shade-card',
  name: 'TDBU Shade Card',
  description: 'Interactive top-down bottom-up shade control card with draggable rails',
  preview: true,
});
