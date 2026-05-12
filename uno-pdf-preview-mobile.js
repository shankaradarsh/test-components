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

  renderDOM() {
    const container = document.createElement("div");
    container.className = "mobile-renderer-container";

    container.innerHTML = `
      <div id="loading-msg" class="info-msg">Loading Document...</div>
      
      <div id="pdf-scroll-view" class="pdf-scroll-view">
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
    
    this.checkbox.addEventListener('change', (e) => {
      this.continueBtn.disabled = !e.target.checked;
    });

    this.continueBtn.addEventListener('click', () => {
      // Dispatches exactly what your SDK routing engine expects
      this.dispatchEvent(new CustomEvent('button-click', { 
        detail: { status: 'confirmed' }, 
        bubbles: true, 
        composed: true 
      }));
    });
  }

  // The Bulletproof Base64 Sanitizer
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

  // Dynamically import the prod-tested .mjs module
  async initPdfLib() {
    if (window.pdfjsLib) return window.pdfjsLib;
    try {
      const module = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.54/pdf.mjs");
      window.pdfjsLib = module;
      return module;
    } catch (e) {
      console.error("Failed to import pdf.mjs:", e);
      return null;
    }
  }

  async loadDocument(base64String) {
    if (!base64String || base64String === 'null') return;

    this.loadingMsg.style.display = 'block';
    this.scrollView.innerHTML = ''; // clear previous

    const pdfjs = await this.initPdfLib();
    if (!pdfjs) {
      this.loadingMsg.innerHTML = `<span style="color: #f44336;">Error: PDF Engine failed to load.</span>`;
      return;
    }

    pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.54/pdf.worker.mjs";

    try {
      const pdfData = this.base64ToArrayBuffer(base64String);
      const loadingTask = pdfjs.getDocument({ data: pdfData });
      const pdf = await loadingTask.promise;
      
      this.loadingMsg.style.display = 'none';
      
      // Render all pages sequentially into the scroll view
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        await this.renderSinglePage(pdf, pageNum);
      }
      
    } catch (error) {
      console.error("PDF Render Error:", error);
      // Print the ACTUAL error to the mobile screen so we don't have to guess
      this.loadingMsg.innerHTML = `<span style="color: #f44336; font-size: 12px; word-break: break-all;">
        <strong>Crash Report:</strong><br/>
        ${error.message || error}<br/><br/>
        <strong>Base64 Length:</strong> ${base64String ? base64String.length : 0} chars
      </span>`;
    }
  }

  async renderSinglePage(pdf, pageNum) {
    const page = await pdf.getPage(pageNum);
    
    // Create a new canvas for this specific page
    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-page-canvas';
    this.scrollView.appendChild(canvas);

    // Render at 1.5x scale for crisp mobile display, CSS will scale it down to fit screen width
    const viewport = page.getViewport({ scale: 1.5 });
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = { 
      canvasContext: canvas.getContext('2d'), 
      viewport: viewport 
    };
    
    // Await ensures we don't crash low-end mobile devices by rendering 25 pages simultaneously
    await page.render(renderContext).promise;
  }

  getStyles() {
    const fontFamily = this.getAttribute("font-family") || "Inter, sans-serif";
    const primaryColor = this.getAttribute("primary-color") || "#542783";
    
    return `
      .mobile-renderer-container {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 85vh; /* Takes up majority of the mobile screen */
        background-color: #191919;
        border: 1px solid #FFFFFF1A;
        border-radius: 8px;
        font-family: ${fontFamily};
        color: #fff;
        overflow: hidden;
      }
      .info-msg { 
        color: #FFFFFFCC; 
        font-size: 14px; 
        text-align: center; 
        padding: 20px; 
      }
      .pdf-scroll-view {
        flex-grow: 1;
        overflow-y: auto;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch; /* Smooth mobile scrolling */
        background-color: #2F2F2F;
        padding: 10px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
      }
      .pdf-page-canvas { 
        max-width: 100%; 
        height: auto; 
        box-shadow: 0 4px 8px rgba(0,0,0,0.4); 
        background-color: white;
      }
      .action-footer {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 16px;
        background-color: #272626;
        border-top: 1px solid #FFFFFF1A;
      }
      .checkbox-container { display: flex; align-items: flex-start; gap: 12px; cursor: pointer; }
      .checkbox-container input { width: 20px; height: 20px; cursor: pointer; accent-color: ${primaryColor}; margin-top: 2px; }
      .check-label { font-size: 14px; color: #FFFFFFCC; line-height: 1.4; }
      .btn {
        padding: 14px 24px;
        border-radius: 6px;
        font-weight: 500;
        cursor: pointer;
        font-family: ${fontFamily};
        font-size: 16px;
        border: none;
        width: 100%;
      }
      .primary-btn { background-color: ${primaryColor}; color: #FFFFFF; }
      .primary-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    `;
  }
}

customElements.define("uno-pdf-mobile-renderer", PdfMobileRenderer);
