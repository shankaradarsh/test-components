class PdfPopoutLauncher extends HTMLElement {
  static get observedAttributes() {
    return ["pdf-url", "button-text", "button-color", "font-family"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    
    // Build the launcher button UI
    const container = document.createElement('div');
    container.innerHTML = `<button class="launch-btn"></button>`;
    
    const style = document.createElement('style');
    this.shadowRoot.append(style, container);
    
    this.btn = this.shadowRoot.querySelector('button');
    this.btn.addEventListener('click', () => this.openPopup());

    // Listen for messages coming BACK from the popup window
    window.addEventListener('message', (event) => {
      // Validate the message is coming from our popup
      if (event.data && event.data.type === 'PDF_REVIEW_ACTION') {
        
        // Dispatch the event into your dynamic form engine
        this.dispatchEvent(new CustomEvent('review-action', {
          detail: { status: event.data.status },
          bubbles: true,
          composed: true
        }));
      }
    });
  }

  connectedCallback() {
    this.renderStyles();
    this.btn.textContent = this.getAttribute('button-text') || "Review Document";
  }

  renderStyles() {
    const bgColor = this.getAttribute('button-color') || "#542783";
    const font = this.getAttribute('font-family') || "Inter, sans-serif";
    
    this.shadowRoot.querySelector('style').textContent = `
      .launch-btn {
        background-color: ${bgColor};
        color: white;
        padding: 12px 24px;
        border: none;
        border-radius: 6px;
        font-family: ${font};
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        width: 100%;
        transition: opacity 0.2s;
      }
      .launch-btn:hover { opacity: 0.9; }
    `;
  }

  openPopup() {
    const targetUrl = this.getAttribute('pdf-url');
    
    // Open a sized popup window
    const popup = window.open('', '_blank', 'width=850,height=900,left=200,top=100');
    
    if(!popup) {
      alert("Popup blocked! Please allow popups for this site to review the document.");
      return;
    }

    // IMPORTANT: Replace the script src below with your actual jsDelivr URL for the uno-pdf-reviewer.js
    const REVIEWER_SCRIPT_URL = "https://cdn.jsdelivr.net/gh/your-github-path/uno-pdf-reviewer.js";

    // Write the HTML payload into the new window
    const htmlPayload = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Document Review</title>
        <style>
          body { margin: 0; background-color: #191919; height: 100vh; display: flex; }
          uno-pdf-reviewer { width: 100%; height: 100%; }
        </style>
        
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
        <script type="module" src="${REVIEWER_SCRIPT_URL}"></script>
      </head>
      <body>
        
        <uno-pdf-reviewer 
          pdf-url="${targetUrl}" 
          confirm-text="Looks Good, Proceed" 
          close-text="Cancel">
        </uno-pdf-reviewer>
        
        <script>
          // Wait for the component to load, then listen for its events
          customElements.whenDefined('uno-pdf-reviewer').then(() => {
            const reviewer = document.querySelector('uno-pdf-reviewer');
            
            reviewer.addEventListener('review-action', (e) => {
              // Blast the action back to the parent SDK window via postMessage
              window.opener.postMessage({ 
                type: 'PDF_REVIEW_ACTION', 
                status: e.detail.status 
              }, '*');
              
              // Close this popup instantly 
              window.close();
            });
          });
        </script>
      </body>
      </html>
    `;
    
    // Inject and execute
    popup.document.open();
    popup.document.write(htmlPayload);
    popup.document.close();
  }
}

customElements.define("uno-pdf-launcher", PdfPopoutLauncher);
