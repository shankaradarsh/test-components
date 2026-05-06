class PdfConfirmGate extends HTMLElement {
    static get observedAttributes() {
        return [
            "pdf-base64",
            "view-btn-text",
            "checkbox-text",
            "continue-btn-text",
            "primary-color",
            "font-family"
        ];
    }

    constructor() {
        super();
        this.attachShadow({ mode: "open" });

        const container = document.createElement('div');
        container.className = 'gate-container';

        container.innerHTML = `
      <div class="action-card">
        <button id="view-pdf-btn" class="btn outline-btn">
          📄 <span id="view-text">View PDF</span>
        </button>
        
        <label class="checkbox-container">
          <input type="checkbox" id="confirm-checkbox">
          <span class="checkmark"></span>
          <span id="check-text" class="check-label">I confirm this document is accurate and good to proceed.</span>
        </label>

        <button id="continue-btn" class="btn primary-btn" disabled>
          <span id="continue-text">Continue</span>
        </button>
      </div>
    `;

        const style = document.createElement('style');
        this.shadowRoot.append(style, container);

        // Bind elements
        this.viewBtn = this.shadowRoot.getElementById('view-pdf-btn');
        this.checkbox = this.shadowRoot.getElementById('confirm-checkbox');
        this.continueBtn = this.shadowRoot.getElementById('continue-btn');

        // Event Listeners
        this.viewBtn.addEventListener('click', () => this.openNativeViewer());

        this.checkbox.addEventListener('change', (e) => {
            this.continueBtn.disabled = !e.target.checked;
        });

        this.continueBtn.addEventListener('click', () => {
            this.dispatchEvent(new CustomEvent('review-action', {
                detail: { status: 'confirmed' },
                bubbles: true,
                composed: true
            }));
        });
    }

    connectedCallback() {
        this.renderStyles();
        this.updateText();
    }

    attributeChangedCallback() {
        this.renderStyles();
        this.updateText();
    }

    updateText() {
        this.shadowRoot.getElementById('view-text').textContent = this.getAttribute('view-btn-text') || "View PDF";
        this.shadowRoot.getElementById('check-text').textContent = this.getAttribute('checkbox-text') || "I confirm this document is accurate and good to proceed.";
        this.shadowRoot.getElementById('continue-text').textContent = this.getAttribute('continue-btn-text') || "Continue";
    }

    openNativeViewer() {
        let base64Data = this.getAttribute('pdf-base64');

        if (!base64Data || base64Data === 'null' || base64Data === '') {
            alert("Document data is missing or hasn't loaded yet.");
            return;
        }

        // 1. Strip the data URI prefix if present
        base64Data = base64Data.replace(/^data:application\/pdf;base64,/, "");

        // 2. Convert URL-safe Base64 to Standard Base64 (swaps - and _)
        base64Data = base64Data.replace(/-/g, '+').replace(/_/g, '/');

        // 3. Strip EVERYTHING that isn't a valid Base64 character
        base64Data = base64Data.replace(/[^A-Za-z0-9+/=]/g, "");

        // 4. Force the string length to be a multiple of 4 using padding
        while (base64Data.length % 4 !== 0) {
            base64Data += "=";
        }

        try {
            // Decode Base64 securely
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);

            // Create a Blob and Object URL
            const blob = new Blob([byteArray], { type: 'application/pdf' });
            const blobUrl = URL.createObjectURL(blob);

            // Open in the browser's native viewer tab
            window.open(blobUrl, '_blank');

        } catch (err) {
            console.error("Failed to decode and open PDF:", err);
            alert("Failed to read document data. The file might be corrupted.");
        }
    }

    renderStyles() {
        const primaryColor = this.getAttribute('primary-color') || "#542783";
        const font = this.getAttribute('font-family') || "Inter, sans-serif";

        this.shadowRoot.querySelector('style').textContent = `
      .gate-container {
        font-family: ${font};
        color: #fff;
        padding: 16px 0;
      }
      .action-card {
        display: flex;
        flex-direction: column;
        gap: 20px;
        background-color: #272626;
        padding: 24px;
        border-radius: 8px;
        border: 1px solid #FFFFFF1A;
      }
      .btn {
        padding: 14px 24px;
        border-radius: 6px;
        font-family: ${font};
        font-size: 16px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 8px;
      }
      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .outline-btn {
        background-color: transparent;
        color: #FFFFFF;
        border: 1px solid #FFFFFF66;
      }
      .outline-btn:hover:not(:disabled) {
        background-color: #FFFFFF1A;
      }
      .primary-btn {
        background-color: ${primaryColor};
        color: #FFFFFF;
        border: none;
      }
      .primary-btn:hover:not(:disabled) {
        opacity: 0.9;
      }
      .checkbox-container {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        cursor: pointer;
        padding: 8px 0;
      }
      .checkbox-container input {
        width: 20px;
        height: 20px;
        cursor: pointer;
        accent-color: ${primaryColor};
        margin-top: 2px;
      }
      .check-label {
        font-size: 14px;
        color: #FFFFFFCC;
        line-height: 1.4;
      }
    `;
    }
}

customElements.define("uno-pdf-confirm-gate", PdfConfirmGate);
