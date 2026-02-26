import { jsPDF } from "jspdf";

const DPI = 150;
const JPEG_QUALITY = 0.85;

const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const progressDiv = document.getElementById("progress");
const progressBar = document.getElementById("progress-bar");
const progressText = document.getElementById("progress-text");
const resultDiv = document.getElementById("result");

// Create worker
const worker = new Worker(new URL("./worker.js", import.meta.url), {
  type: "module",
});

let resolveMessage = null;
function waitForMessage(expectedType) {
  return new Promise((resolve, reject) => {
    resolveMessage = (msg) => {
      if (msg.type === "error") reject(new Error(msg.message));
      else if (msg.type === expectedType) resolve(msg);
    };
  });
}

worker.onmessage = (e) => {
  if (resolveMessage) resolveMessage(e.data);
};

// Click to select
dropZone.addEventListener("click", () => {
  if (!dropZone.classList.contains("processing")) fileInput.click();
});
fileInput.addEventListener("change", (e) => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});

// Drag and drop
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});
dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

async function handleFile(file) {
  dropZone.classList.add("processing");
  progressDiv.style.display = "block";
  resultDiv.innerHTML = "";
  progressBar.style.width = "0%";
  progressText.textContent = "Loading PDF...";

  try {
    const arrayBuffer = await file.arrayBuffer();

    // Load document in worker
    const loadPromise = waitForMessage("loaded");
    worker.postMessage(
      { type: "load", data: { buffer: arrayBuffer, filename: file.name } },
      [arrayBuffer]
    );
    const { numPages } = await loadPromise;

    progressText.textContent = "0 / " + numPages + " pages";

    // Render each page via the MuPDF worker and convert to JPEG
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const pages = [];

    for (let i = 0; i < numPages; i++) {
      const renderPromise = waitForMessage("rendered");
      worker.postMessage({
        type: "render",
        data: { pageNumber: i, dpi: DPI },
      });
      const { width, height, pixels } = await renderPromise;

      // Draw RGBA pixels onto canvas
      canvas.width = width;
      canvas.height = height;
      const imageData = new ImageData(
        new Uint8ClampedArray(pixels),
        width,
        height
      );
      ctx.putImageData(imageData, 0, 0);

      // Export as JPEG data URL
      const imgData = canvas.toDataURL("image/jpeg", JPEG_QUALITY);

      // Page size in points
      const widthPt = (width * 72) / DPI;
      const heightPt = (height * 72) / DPI;

      pages.push({ imgData, widthPt, heightPt });

      const pct = Math.round(((i + 1) / numPages) * 100);
      progressBar.style.width = pct + "%";
      progressText.textContent = i + 1 + " / " + numPages + " pages";
    }

    worker.postMessage({ type: "close" });

    // Build new PDF with jsPDF
    progressText.textContent = "Building PDF...";

    const firstPage = pages[0];
    const firstOrientation = firstPage.widthPt > firstPage.heightPt ? "l" : "p";
    const doc = new jsPDF({
      unit: "pt",
      format: [Math.min(firstPage.widthPt, firstPage.heightPt), Math.max(firstPage.widthPt, firstPage.heightPt)],
      orientation: firstOrientation,
    });

    for (let i = 0; i < pages.length; i++) {
      const { imgData, widthPt, heightPt } = pages[i];
      const orientation = widthPt > heightPt ? "l" : "p";
      if (i > 0) doc.addPage([Math.min(widthPt, heightPt), Math.max(widthPt, heightPt)], orientation);
      doc.addImage(imgData, "JPEG", 0, 0, widthPt, heightPt);
    }

    // Trigger download
    const baseName = file.name.replace(/\.pdf$/i, "");
    const outputName = baseName + " - Fixed.pdf";
    doc.save(outputName);

    progressBar.style.width = "100%";
    progressText.textContent = "";
    resultDiv.innerHTML =
      '<div class="done">\u2713 ' +
      outputName +
      " downloaded</div>" +
      '<div style="text-align:center"><span class="reset-link" id="reset">Fix another PDF</span></div>';
    document.getElementById("reset").addEventListener("click", reset);
  } catch (err) {
    resultDiv.innerHTML =
      '<div class="error">Error: ' +
      err.message +
      "</div>" +
      '<div style="text-align:center"><span class="reset-link" id="reset">Try again</span></div>';
    document.getElementById("reset").addEventListener("click", reset);
  }
}

function reset() {
  dropZone.classList.remove("processing");
  progressDiv.style.display = "none";
  resultDiv.innerHTML = "";
  fileInput.value = "";
}
