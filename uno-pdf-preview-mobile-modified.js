class PdfMobileRenderer extends HTMLElement {
  static get observedAttributes() {
    return [
      "pdf-base64", 
      "confirm-btn-text", 
      "primary-color",
      "font-family"
    ];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.isInitialized = false;
    this.zoomLevel = 100;
    this.lastZoomTouchTs = 0;
  }

  connectedCallback() {
    if (!this.isInitialized) {
      this.renderDOM();
      this.bindElements();
      this.isInitialized = true;
    }
    
    if (this.hasAttribute('pdf-base64')) {
      this.loadDocument(this.getAttribute('pdf-base64'));
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'pdf-base64' && newValue && newValue !== oldValue && this.isInitialized) {
      this.loadDocument(newValue);
    }
  }

  renderDOM() {
    const container = document.createElement("div");
    container.className = "mobile-renderer-container";

    container.innerHTML = `
      <div id="loading-msg" class="info-msg">Loading Document...</div>
      
      <div class="pdf-wrapper">
        <div id="pdf-scroll-view" class="pdf-scroll-view">
          </div>
        
        <div class="zoom-controls" id="zoom-controls" style="display: none;">
          <button id="zoom-out-btn" class="zoom-btn">−</button>
          <span id="zoom-text">100%</span>
          <button id="zoom-in-btn" class="zoom-btn">+</button>
        </div>
      </div>

      <div class="action-footer">
        <label class="checkbox-container">
          <input type="checkbox" id="confirm-checkbox">
          <span class="checkmark"></span>
          <span id="check-text" class="check-label">I confirm this document is accurate.</span>
        </label>

        <button id="continue-btn" class="btn primary-btn" disabled>
          <span id="continue-text">${this.getAttribute("confirm-btn-text") || "Confirm & Continue"}</span>
        </button>
      </div>
    `;

    const style = document.createElement("style");
    style.textContent = this.getStyles();

    this.shadowRoot.append(style, container);
  }

  bindElements() {
    this.scrollView = this.shadowRoot.getElementById('pdf-scroll-view');
    this.loadingMsg = this.shadowRoot.getElementById('loading-msg');
    this.checkbox = this.shadowRoot.getElementById('confirm-checkbox');
    this.continueBtn = this.shadowRoot.getElementById('continue-btn');
    this.zoomControls = this.shadowRoot.getElementById('zoom-controls');
    this.zoomText = this.shadowRoot.getElementById('zoom-text');
    
    const zoomInBtn = this.shadowRoot.getElementById('zoom-in-btn');
    const zoomOutBtn = this.shadowRoot.getElementById('zoom-out-btn');

    const bindZoom = (btn, delta) => {
      btn.addEventListener('touchend', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.lastZoomTouchTs = Date.now();
        this.handleZoom(delta);
      }, { passive: false });

      btn.addEventListener('click', (event) => {
        if (Date.now() - this.lastZoomTouchTs < 500) {
          event.preventDefault();
          return;
        }
        this.handleZoom(delta);
      });
    };

    bindZoom(zoomInBtn, 25);
    bindZoom(zoomOutBtn, -25);

    this.checkbox.addEventListener('change', (e) => {
      this.continueBtn.disabled = !e.target.checked;
    });

    this.continueBtn.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('button-click', { 
        detail: { status: 'confirmed' }, 
        bubbles: true, 
        composed: true 
      }));
    });
  }

  handleZoom(delta) {
    this.zoomLevel = Math.max(100, Math.min(250, this.zoomLevel + delta));
    this.zoomText.textContent = this.zoomLevel + '%';

    const canvases = this.shadowRoot.querySelectorAll('.pdf-page-canvas');
    canvases.forEach(canvas => {
      if (this.zoomLevel === 100) {
        canvas.style.width = '100%';
        canvas.style.maxWidth = '100%';
      } else {
        canvas.style.maxWidth = 'none';
        canvas.style.width = this.zoomLevel + '%';
      }
    });
  }

  base64ToArrayBuffer(base64Data) {
    base64Data = base64Data.replace(/^data:application\/pdf;base64,/, "");
    base64Data = base64Data.replace(/-/g, '+').replace(/_/g, '/');
    base64Data = base64Data.replace(/[^A-Za-z0-9+/=]/g, "");
    
    while (base64Data.length % 4 !== 0) {
      base64Data += "=";
    }

    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    return new Uint8Array(byteNumbers).buffer;
  }

  async initPdfLib() {
    if (window.pdfjsLib) return window.pdfjsLib;
    try {
      const module = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.mjs");
      window.pdfjsLib = module;
      return module;
    } catch (e) {
      throw new Error("Failed to import pdf.mjs: " + e.message);
    }
  }

  async loadDocument(base64String) {
    if (!base64String || base64String === 'null') return;

    this.loadingMsg.style.display = 'block';
    this.scrollView.innerHTML = ''; 

    try {
      const pdfjs = await this.initPdfLib();
      if (!pdfjs) {
        throw new Error("PDF Engine failed to load.");
      }

      if (pdfjs.GlobalWorkerOptions) {
        const currentVersion = pdfjs.version || "4.9.155"; 
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${currentVersion}/pdf.worker.min.mjs`;
      } else {
        console.warn("GlobalWorkerOptions not found on the pdfjs object.");
      }

      const pdfData = this.base64ToArrayBuffer(base64String);
      const loadingTask = pdfjs.getDocument({ data: pdfData });
      const pdf = await loadingTask.promise;
      
      this.loadingMsg.style.display = 'none';
      this.zoomControls.style.display = 'flex';
      
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        await this.renderSinglePage(pdf, pageNum);
      }
      
    } catch (error) {
      console.error("PDF Render Error:", error);
      this.loadingMsg.innerHTML = `<span style="color: #f44336; font-size: 12px; word-break: break-all;">
        <strong>Crash Report:</strong><br/>
        ${error.message || error}<br/><br/>
        <strong>Stack Trace:</strong><br/>
        ${error.stack ? error.stack.substring(0, 200) : 'N/A'}
      </span>`;
    }
  }

  async renderSinglePage(pdf, pageNum) {
    const page = await pdf.getPage(pageNum);
    
    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-page-canvas';
    this.scrollView.appendChild(canvas);

    // CHANGED: Render at 2.0x scale for high-end device crispness
    const viewport = page.getViewport({ scale: 2.0 });
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = { 
      canvasContext: canvas.getContext('2d'), 
      viewport: viewport 
    };
    
    await page.render(renderContext).promise;
  }

  getStyles() {
    const fontFamily = this.getAttribute("font-family") || "Inter, sans-serif";
    const primaryColor = this.getAttribute("primary-color") || "#542783";
    
    return `
      :host {
        display: block;
        width: 100%;
        height: 100%; 
        box-sizing: border-box;
      }
      .mobile-renderer-container {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        background-color: #191919;
        border: 1px solid #FFFFFF1A;
        border-radius: 8px;
        font-family: ${fontFamily};
        color: #fff;
      }
      .info-msg { color: #FFFFFFCC; font-size: 14px; text-align: center; padding: 10px; }
      
      .pdf-wrapper {
        position: relative;
        flex-grow: 1;
        overflow: hidden;
      }
      
      /* CHANGED: Removed Flexbox to prevent left-side clipping on zoom */
      .pdf-scroll-view {
        width: 100%;
        height: 100%;
        overflow-y: auto;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch; 
        background-color: #2F2F2F;
        padding: 6px;
        box-sizing: border-box;
        text-align: center; /* Natively centers the canvas without trapping it */
      }
      
      /* CHANGED: Switched to inline-block to respect text-align, added bottom margin */
      .pdf-page-canvas { 
        display: inline-block;
        max-width: 100%; 
        width: 100%;
        height: auto; 
        box-shadow: 0 4px 8px rgba(0,0,0,0.4); 
        background-color: white;
        transition: width 0.2s ease-out; 
        margin-bottom: 8px; 
      }

      /* Keep controls pinned inside the viewer viewport while content scrolls underneath */
      .zoom-controls {
        position: absolute;
        top: 12px;
        right: 12px;
        z-index: 10000;
        pointer-events: auto;
        touch-action: manipulation;
        background-color: rgba(25, 25, 25, 0.85);
        border: 1px solid #FFFFFF33;
        border-radius: 20px;
        display: flex;
        align-items: center;
        padding: 4px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.6);
        backdrop-filter: blur(4px);
      }
      .zoom-btn {
        -webkit-appearance: none;
        background: transparent;
        color: #fff;
        border: none;
        font-size: 20px;
        width: 36px;
        height: 36px;
        display: flex;
        justify-content: center;
        align-items: center;
        cursor: pointer;
        border-radius: 50%;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
      }
      .zoom-btn:active { background-color: #FFFFFF33; }
      #zoom-text {
        font-size: 12px;
        font-weight: 600;
        width: 44px;
        text-align: center;
        color: #FFF;
      }

      .action-footer {
        display: flex;
        flex-direction: column;
        gap: 10px; 
        padding: 10px;
        background-color: #272626;
        border-top: 1px solid #FFFFFF1A;
        flex-shrink: 0; 
      }
      .checkbox-container { display: flex; align-items: flex-start; gap: 8px; cursor: pointer; }
      .checkbox-container input { width: 18px; height: 18px; cursor: pointer; accent-color: ${primaryColor}; margin-top: 2px; }
      .check-label { font-size: 13px; color: #FFFFFFCC; line-height: 1.3; }
      .btn { padding: 12px 20px; border-radius: 6px; font-weight: 500; cursor: pointer; font-family: ${fontFamily}; font-size: 14px; border: none; width: 100%; }
      .primary-btn { background-color: ${primaryColor}; color: #FFFFFF; }
      .primary-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    `;
  }
}

customElements.define("uno-pdf-mobile-renderer", PdfMobileRenderer);