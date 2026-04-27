class PdfReviewer extends HTMLElement {
  static get observedAttributes() {
    return [
      "pdf-url",
      "confirm-text",
      "close-text",
      "primary-color",
      "font-family"
    ];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    // Internal state
    this.pdfDoc = null;
    this.pageNum = 1;
    this.pageRendering = false;
    this.pageNumPending = null;
    this.scale = 1.2;

    // Build the DOM
    const container = document.createElement("div");
    container.className = "pdf-reviewer-container";

    container.innerHTML = `
      <div class="pdf-header">
        <span class="page-info">Page <span id="page_num"></span> of <span id="page_count"></span></span>
        <div class="pagination-controls">
          <button id="prev-btn" class="icon-btn">◀ Prev</button>
          <button id="next-btn" class="icon-btn">Next ▶</button>
        </div>
      </div>
      
      <div class="canvas-container">
        <canvas id="pdf-canvas"></canvas>
      </div>
      <div class="action-footer">
        <button id="close-btn" class="btn secondary-btn">${this.getAttribute("close-text") || "Close"}</button>
        <button id="confirm-btn" class="btn primary-btn">${this.getAttribute("confirm-text") || "Confirm & Continue"}</button>
      </div>
    `;

    // Attach styles
    const style = document.createElement("style");
    style.textContent = this.getStyles();

    this.shadowRoot.append(style, container);

    // Bind elements
    this.canvas = this.shadowRoot.getElementById('pdf-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.prevBtn = this.shadowRoot.getElementById('prev-btn');
    this.nextBtn = this.shadowRoot.getElementById('next-btn');
    this.closeBtn = this.shadowRoot.getElementById('close-btn');
    this.confirmBtn = this.shadowRoot.getElementById('confirm-btn');
    this.pageNumSpan = this.shadowRoot.getElementById('page_num');
    this.pageCountSpan = this.shadowRoot.getElementById('page_count');

    // Bind Event Listeners
    this.prevBtn.addEventListener('click', () => this.onPrevPage());
    this.nextBtn.addEventListener('click', () => this.onNextPage());
    
    this.closeBtn.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('review-action', {
        detail: { status: 'closed', message: 'User closed the document' },
        bubbles: true,
        composed: true
      }));
    });

    this.confirmBtn.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('review-action', {
        detail: { status: 'confirmed', message: 'User confirmed the document' },
        bubbles: true,
        composed: true
      }));
    });
  }

  connectedCallback() {
    this.initPdfWorkers();
    if (this.hasAttribute('pdf-url')) {
      this.loadDocument(this.getAttribute('pdf-url'));
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'pdf-url' && oldValue !== newValue && newValue) {
      this.loadDocument(newValue);
    }
  }

  initPdfWorkers() {
    // Ensure worker is loaded (matching your existing implementation)
    if (!window.pdfjsLib) return;
    if (pdfjsLib.GlobalWorkerOptions.workerSrc !== "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.54/pdf.worker.mjs") {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.54/pdf.worker.mjs";
    }
  }

  loadDocument(url) {
    if (!window.pdfjsLib) {
      console.error("PDF.js library not found on window object.");
      return;
    }

    // Fetch the PDF using pdf.js (bypasses Content-Disposition headers)
    const loadingTask = pdfjsLib.getDocument(url);
    
    loadingTask.promise.then((pdf) => {
      this.pdfDoc = pdf;
      this.pageCountSpan.textContent = pdf.numPages;
      this.renderPage(this.pageNum);
    }).catch((error) => {
      console.error("Error loading PDF:", error);
      this.canvas.parentElement.innerHTML = `<div class="error-msg">Failed to load PDF. It might be expired or blocked by CORS.</div>`;
    });
  }

  renderPage(num) {
    this.pageRendering = true;
    
    this.pdfDoc.getPage(num).then((page) => {
      const viewport = page.getViewport({ scale: this.scale });
      this.canvas.height = viewport.height;
      this.canvas.width = viewport.width;

      const renderContext = {
        canvasContext: this.ctx,
        viewport: viewport
      };
      
      const renderTask = page.render(renderContext);
      renderTask.promise.then(() => {
        this.pageRendering = false;
        if (this.pageNumPending !== null) {
          this.renderPage(this.pageNumPending);
          this.pageNumPending = null;
        }
      });
    });

    this.pageNumSpan.textContent = num;
  }

  queueRenderPage(num) {
    if (this.pageRendering) {
      this.pageNumPending = num;
    } else {
      this.renderPage(num);
    }
  }

  onPrevPage() {
    if (this.pageNum <= 1) return;
    this.pageNum--;
    this.queueRenderPage(this.pageNum);
  }

  onNextPage() {
    if (this.pageNum >= this.pdfDoc.numPages) return;
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
      .page-info {
        font-size: 14px;
        color: #FFFFFFCC;
      }
      .pagination-controls {
        display: flex;
        gap: 8px;
      }
      .icon-btn {
        background: transparent;
        border: 1px solid #FFFFFF33;
        color: #FFF;
        padding: 4px 8px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      }
      .icon-btn:hover {
        background: #FFFFFF1A;
      }
      .canvas-container {
        flex-grow: 1;
        overflow: auto;
        display: flex;
        justify-content: center;
        padding: 20px;
        background-color: #2F2F2F;
      }
      #pdf-canvas {
        box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        max-width: 100%;
        height: auto;
      }
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
      .secondary-btn {
        background-color: transparent;
        color: #FFFFFF;
        border: 1px solid #FFFFFF66;
      }
      .primary-btn {
        background-color: ${primaryColor};
        color: #FFFFFF;
      }
      .error-msg {
        color: #f44336;
        text-align: center;
        margin-top: 20px;
      }
    `;
  }
}

customElements.define("uno-pdf-reviewer", PdfReviewer);
