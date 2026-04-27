class PdfReviewer extends HTMLElement {
  static get observedAttributes() {
    return ["pdf-url", "confirm-text", "close-text", "primary-color", "font-family"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.pdfDoc = null;
    this.pageNum = 1;
    this.pageRendering = false;
    this.pageNumPending = null;
    this.scale = 1.2;
    this.isInitialized = false;
  }

  connectedCallback() {
    if (!this.isInitialized) {
      this.renderDOM();
      this.bindElements();
      this.isInitialized = true;
    }
    
    if (this.hasAttribute('pdf-url')) {
      this.loadDocument(this.getAttribute('pdf-url'));
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'pdf-url' && oldValue !== newValue && newValue && this.isInitialized) {
      this.loadDocument(newValue);
    }
  }

  renderDOM() {
    const container = document.createElement("div");
    container.className = "pdf-reviewer-container";

    container.innerHTML = `
      <div class="pdf-header">
        <span class="page-info">Page <span id="page_num">-</span> of <span id="page_count">-</span></span>
        <div class="pagination-controls">
          <button id="prev-btn" class="icon-btn">◀ Prev</button>
          <button id="next-btn" class="icon-btn">Next ▶</button>
        </div>
      </div>
      
      <div class="canvas-container">
        <div id="loading-msg" class="info-msg">Initializing Viewer...</div>
        <canvas id="pdf-canvas" style="display: none;"></canvas>
      </div>

      <div class="action-footer">
        <button id="close-btn" class="btn secondary-btn">${this.getAttribute("close-text") || "Close"}</button>
        <button id="confirm-btn" class="btn primary-btn">${this.getAttribute("confirm-text") || "Confirm & Continue"}</button>
      </div>
    `;

    const style = document.createElement("style");
    style.textContent = this.getStyles();

    this.shadowRoot.append(style, container);
  }

  bindElements() {
    this.canvas = this.shadowRoot.querySelector('#pdf-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.loadingMsg = this.shadowRoot.querySelector('#loading-msg');
    
    this.shadowRoot.querySelector('#prev-btn').addEventListener('click', () => this.onPrevPage());
    this.shadowRoot.querySelector('#next-btn').addEventListener('click', () => this.onNextPage());
    
    this.shadowRoot.querySelector('#close-btn').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('review-action', { detail: { status: 'closed' }, bubbles: true, composed: true }));
    });

    this.shadowRoot.querySelector('#confirm-btn').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('review-action', { detail: { status: 'confirmed' }, bubbles: true, composed: true }));
    });
  }

  // Dynamically import the .mjs module if the global isn't ready
  async initPdfLib() {
    if (window.pdfjsLib) return window.pdfjsLib;
    
    try {
      const module = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.54/pdf.mjs");
      window.pdfjsLib = module;
      return module;
    } catch (e) {
      console.error("Failed to import pdf.mjs dynamically:", e);
      return null;
    }
  }

  async loadDocument(url) {
    this.loadingMsg.style.display = 'block';
    this.loadingMsg.innerHTML = "Loading PDF Engine...";
    this.canvas.style.display = 'none';

    const pdfjs = await this.initPdfLib();
    
    if (!pdfjs) {
      this.loadingMsg.innerHTML = `<span style="color: #f44336;">Error: PDF.js library failed to load.</span>`;
      return;
    }

    // Matches your prod implementation EXACTLY
    if (pdfjs.GlobalWorkerOptions.workerSrc !== "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.54/pdf.worker.mjs") {
      pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.54/pdf.worker.mjs";
    }

    this.loadingMsg.innerHTML = "Downloading Document...";

    try {
      const loadingTask = pdfjs.getDocument(url);
      const pdf = await loadingTask.promise;
      
      this.pdfDoc = pdf;
      this.shadowRoot.querySelector('#page_count').textContent = pdf.numPages;
      this.loadingMsg.style.display = 'none';
      this.canvas.style.display = 'block';
      
      this.renderPage(this.pageNum);
    } catch (error) {
      console.error("PDF Load Error:", error);
      this.loadingMsg.innerHTML = `<span style="color: #f44336;">Failed to load PDF. Signature might be expired.</span>`;
    }
  }

  renderPage(num) {
    this.pageRendering = true;
    this.pdfDoc.getPage(num).then((page) => {
      const viewport = page.getViewport({ scale: this.scale });
      this.canvas.height = viewport.height;
      this.canvas.width = viewport.width;

      const renderContext = { canvasContext: this.ctx, viewport: viewport };
      
      page.render(renderContext).promise.then(() => {
        this.pageRendering = false;
        if (this.pageNumPending !== null) {
          this.renderPage(this.pageNumPending);
          this.pageNumPending = null;
        }
      });
    });

    this.shadowRoot.querySelector('#page_num').textContent = num;
  }

  queueRenderPage(num) {
    if (this.pageRendering) {
      this.pageNumPending = num;
    } else {
      this.renderPage(num);
    }
  }

  onPrevPage() {
    if (!this.pdfDoc || this.pageNum <= 1) return;
    this.pageNum--;
    this.queueRenderPage(this.pageNum);
  }

  onNextPage() {
    if (!this.pdfDoc || this.pageNum >= this.pdfDoc.numPages) return;
    this.pageNum++;
    this.queueRenderPage(this.pageNum);
  }

  getStyles() {
    const fontFamily = this.getAttribute("font-family") || "Inter, sans-serif";
    const primaryColor = this.getAttribute("primary-color") || "#542783";
    
    return `
      .pdf-reviewer-container {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        min-height: 500px;
        background-color: #272626;
        border: 1px solid #FFFFFF1A;
        border-radius: 8px;
        font-family: ${fontFamily};
        color: #fff;
        overflow: hidden;
      }
      .pdf-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background-color: #191919;
        border-bottom: 1px solid #FFFFFF1A;
      }
      .page-info { font-size: 14px; color: #FFFFFFCC; }
      .pagination-controls { display: flex; gap: 8px; }
      .icon-btn {
        background: transparent;
        border: 1px solid #FFFFFF33;
        color: #FFF;
        padding: 4px 8px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      }
      .icon-btn:hover { background: #FFFFFF1A; }
      .canvas-container {
        flex-grow: 1;
        overflow: auto;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 20px;
        background-color: #2F2F2F;
      }
      #pdf-canvas { box-shadow: 0 4px 8px rgba(0,0,0,0.3); max-width: 100%; height: auto; }
      .action-footer {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        padding: 16px;
        background-color: #191919;
        border-top: 1px solid #FFFFFF1A;
      }
      .btn {
        padding: 10px 20px;
        border-radius: 6px;
        font-weight: 500;
        cursor: pointer;
        font-family: ${fontFamily};
        font-size: 14px;
        border: none;
      }
      .secondary-btn { background-color: transparent; color: #FFFFFF; border: 1px solid #FFFFFF66; }
      .primary-btn { background-color: ${primaryColor}; color: #FFFFFF; }
      .info-msg { color: #FFFFFFCC; font-size: 14px; }
    `;
  }
}

customElements.define("uno-pdf-reviewer", PdfReviewer);
