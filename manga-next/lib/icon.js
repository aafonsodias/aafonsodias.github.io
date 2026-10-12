// The extension ships no binary files, so the icon is a small inline PNG (48x48).
export const ICON_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAiklEQVR42u3auw2AMAyEYU9Hm7Hp2YE1AqIAAYkiHo3P+U9yf19r26yRNMyLh7G38VL8E8Rr+UcI7+WbCJXyVYRa+QIhDVAtfyAAqAL+ZJzyZeQAd4Qk4IyQBewIacAWAAAAAAAAAAAAAAAAAAAAAACAjgAsdwFEAXAj41LZ4a047qtBiGcPtXebFU9tYnTZzrKoAAAAAElFTkSuQmCC';

// Draw the inline icon into the toolbar button. Chrome keeps it until the extension reloads.
export async function installActionIcon() {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return;
  try {
    const blob = await (await fetch(ICON_DATA_URL)).blob();
    const bitmap = await createImageBitmap(blob);
    const imageData = {};
    for (const size of [16, 32]) {
      const canvas = new OffscreenCanvas(size, size);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, size, size);
      imageData[size] = ctx.getImageData(0, 0, size, size);
    }
    await chrome.action.setIcon({ imageData });
  } catch (e) {
    console.warn('Manga Next: could not set the toolbar icon', e);
  }
}
