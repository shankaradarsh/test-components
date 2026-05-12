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

// Dynamically import the exact version your environment expects if it's missing
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

      // THE FIX: Move this inside the Try/Catch, and safely check if GlobalWorkerOptions exists
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
      
      // Render all pages sequentially into the scroll view
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
      /* Force the custom web component tag to strictly fill its parent SDK container */
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
        height: 100%; /* Swapped from 85vh to 100% */
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
        padding: 10px; 
      }
      .pdf-scroll-view {
        flex-grow: 1; /* This forces the PDF area to absorb exactly whatever height is leftover */
        overflow-y: auto;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch; 
        background-color: #2F2F2F;
        padding: 6px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
      }
      .pdf-page-canvas { 
        max-width: 100%; 
        height: auto; 
        box-shadow: 0 4px 8px rgba(0,0,0,0.4); 
        background-color: white;
      }
      /* Squashed the footer down to save precious screen real estate */
      .action-footer {
        display: flex;
        flex-direction: column;
        gap: 10px; 
        padding: 10px;
        background-color: #272626;
        border-top: 1px solid #FFFFFF1A;
        flex-shrink: 0; /* Prevents the footer from getting crushed */
      }
      .checkbox-container { display: flex; align-items: flex-start; gap: 8px; cursor: pointer; }
      .checkbox-container input { width: 18px; height: 18px; cursor: pointer; accent-color: ${primaryColor}; margin-top: 2px; }
      .check-label { font-size: 13px; color: #FFFFFFCC; line-height: 1.3; }
      .btn {
        padding: 12px 20px; /* Slimmer button */
        border-radius: 6px;
        font-weight: 500;
        cursor: pointer;
        font-family: ${fontFamily};
        font-size: 14px;
        border: none;
        width: 100%;
      }
      .primary-btn { background-color: ${primaryColor}; color: #FFFFFF; }
      .primary-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    `;
  }
}

customElements.define("uno-pdf-mobile-renderer", PdfMobileRenderer);
