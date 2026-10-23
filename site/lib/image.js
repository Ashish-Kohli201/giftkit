// Pictures are shrunk on the phone before they are used: a 12 MB photo becomes about 300 KB, so uploads are fast on 4G.
// Returns a Blob (JPEG, longest side at most `max` px). Falls back to the original file if the browser cannot decode it.
export async function shrinkImage(file, max = 1600, quality = 0.85) {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob ?? file;
  } catch {
    return file;
  }
}
