import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';

/**
 * File save/share that works in three places:
 *  - Android app (Capacitor shell): write to the app cache, open the native share sheet
 *  - Mobile/desktop browser with Web Share Level 2: navigator.share({ files })
 *  - Anything else: plain browser download (the original behaviour)
 */

export const isNativeApp = () => Capacitor.isNativePlatform();

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function nativeShare(blob: Blob, filename: string, text?: string, title?: string) {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
  });
  try {
    await Share.share({ files: [uri], text, title, dialogTitle: title ?? 'Share' });
  } catch (err: any) {
    // Closing the share sheet without picking an app is not an error
    if (!/cancel/i.test(String(err?.message ?? err))) throw err;
  }
}

function browserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Save a file: browser download on the web, share sheet in the Android app (WebView ignores <a download>). */
export async function downloadBlob(blob: Blob, filename: string) {
  if (isNativeApp()) return nativeShare(blob, filename, undefined, filename);
  browserDownload(blob, filename);
}

/**
 * Open the share sheet with the file attached (e.g. to send to WhatsApp).
 * Falls back to a download where sharing files isn't supported (most desktop browsers).
 */
export async function shareFile(blob: Blob, filename: string, opts: { text?: string; title?: string } = {}) {
  if (isNativeApp()) return nativeShare(blob, filename, opts.text, opts.title);

  const file = new File([blob], filename, { type: blob.type });
  const data: ShareData = { files: [file], text: opts.text, title: opts.title };
  if (!navigator.canShare?.(data)) {
    browserDownload(blob, filename);
    toast.info('Sharing is not supported in this browser — the file was downloaded instead.');
    return;
  }

  try {
    await navigator.share(data);
  } catch (err: any) {
    if (err?.name === 'AbortError') return; // user closed the share sheet
    if (err?.name === 'NotAllowedError') {
      // The browser needs a fresh tap if fetching the file took too long; offer one
      toast.success(`${filename} is ready`, {
        duration: 15000,
        action: { label: 'Share', onClick: () => navigator.share(data).catch(() => undefined) },
      });
      return;
    }
    throw err;
  }
}
