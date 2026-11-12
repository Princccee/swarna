import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, X } from 'lucide-react';
import { compressImage } from '@/lib/images';

const MAX_PER_PICK = 10;

/**
 * "Camera" opens the phone camera directly (capture=environment = back camera);
 * "Gallery" opens the photo picker and allows several photos. On a desktop both open
 * the file chooser. Photos are compressed before they are handed to onPick.
 */
export function ImagePicker({
  onPick,
  disabled,
  busy,
  busyLabel = 'Uploading…',
}: {
  onPick: (files: File[]) => void;
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const working = busy || processing;

  async function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []).slice(0, MAX_PER_PICK);
    e.target.value = ''; // allow picking the same photo again
    if (!picked.length) return;
    setProcessing(true);
    try {
      onPick(await Promise.all(picked.map(compressImage)));
    } finally {
      setProcessing(false);
    }
  }

  const btn =
    'inline-flex items-center gap-1.5 border rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted/50 disabled:opacity-50';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={btn} disabled={disabled || working} onClick={() => cameraRef.current?.click()}>
        <Camera size={15} /> Camera
      </button>
      <button type="button" className={btn} disabled={disabled || working} onClick={() => galleryRef.current?.click()}>
        <ImagePlus size={15} /> Gallery
      </button>
      {working && (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 size={13} className="animate-spin" /> {processing ? 'Preparing…' : busyLabel}
        </span>
      )}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handle} />
      <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={handle} />
    </div>
  );
}

/** Square thumbnails. The remove button is always visible on touch screens (no hover there). */
export function PhotoGrid({
  urls,
  alt,
  onOpen,
  onRemove,
  removeDisabled,
}: {
  urls: string[];
  alt: string;
  onOpen?: (index: number) => void;
  onRemove?: (index: number) => void;
  removeDisabled?: boolean;
}) {
  if (!urls.length) return null;
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
      {urls.map((url, i) => (
        <div key={url} className="relative group aspect-square rounded-lg overflow-hidden border bg-muted/30">
          <img
            src={url}
            alt={`${alt} ${i + 1}`}
            className={`w-full h-full object-cover ${onOpen ? 'cursor-pointer' : ''}`}
            onClick={() => onOpen?.(i)}
          />
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(i)}
              disabled={removeDisabled}
              title="Remove photo"
              aria-label={`Remove photo ${i + 1}`}
              className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-7 h-7 flex items-center justify-center hover:bg-red-600 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 disabled:opacity-50"
            >
              <X size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Photos chosen on a "new" form, held until the record is saved. */
export function usePendingPhotos() {
  const [files, setFiles] = useState<File[]>([]);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  return {
    files,
    previews,
    add: (more: File[]) => setFiles((cur) => [...cur, ...more].slice(0, MAX_PER_PICK)),
    removeAt: (i: number) => setFiles((cur) => cur.filter((_, j) => j !== i)),
  };
}
