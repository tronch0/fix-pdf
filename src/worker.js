import * as mupdf from "mupdf";

// Render a single page to RGBA pixel data at the given DPI
function renderPage(docPointer, pageNumber, dpi) {
  const doc = docPointer;
  const page = doc.loadPage(pageNumber);
  const scale = dpi / 72;
  const matrix = mupdf.Matrix.scale(scale, scale);
  const bounds = page.getBounds();
  const bbox = mupdf.Rect.transform(bounds, matrix);

  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, bbox, true);
  pixmap.clear(255);

  const device = new mupdf.DrawDevice(matrix, pixmap);
  page.run(device, mupdf.Matrix.identity);
  device.close();

  const width = pixmap.getWidth();
  const height = pixmap.getHeight();
  const pixels = pixmap.getPixels().slice();

  pixmap.destroy();
  device.destroy();
  page.destroy();

  return { width, height, pixels };
}

let currentDoc = null;

onmessage = async function (event) {
  const { type, data } = event.data;

  if (type === "load") {
    try {
      if (currentDoc) {
        currentDoc.destroy();
        currentDoc = null;
      }
      currentDoc = mupdf.Document.openDocument(data.buffer, data.filename);
      const numPages = currentDoc.countPages();
      postMessage({ type: "loaded", numPages });
    } catch (err) {
      postMessage({ type: "error", message: err.message });
    }
  }

  if (type === "render") {
    try {
      const result = renderPage(currentDoc, data.pageNumber, data.dpi);
      postMessage(
        { type: "rendered", pageNumber: data.pageNumber, ...result },
        [result.pixels.buffer]
      );
    } catch (err) {
      postMessage({ type: "error", message: err.message });
    }
  }

  if (type === "close") {
    if (currentDoc) {
      currentDoc.destroy();
      currentDoc = null;
    }
  }
};
