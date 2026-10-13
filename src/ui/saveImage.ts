const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * Keeps a picture on the device. iOS has no real download for a web page: a download link only
 * opens a preview, so there the share sheet goes up instead, which carries "Save Image" to Photos.
 */
export async function saveImage(file: File) {
  if (IS_IOS && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      // The file alone: with words beside it, iOS drops "Save Image" from the sheet.
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // closed the share sheet
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
