import { useEffect, useRef, type RefObject } from "react";

/** Cloudinary's free plan refuses images over 10 MB. */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Drag & drop an image/GIF anywhere on the chat it belongs to. The chat's root element carries
 * `data-drop-zone`; the input handles a drop only when its own zone is the innermost zone under
 * the pointer (so a thread panel inside a channel view gets its own drops).
 */
export function useImageDrop(anchorRef: RefObject<HTMLElement | null>, onImage: (file: File) => void) {
  const onImageRef = useRef(onImage);
  onImageRef.current = onImage;
  useEffect(() => {
    const zone = anchorRef.current?.closest<HTMLElement>("[data-drop-zone]");
    if (!zone) return;
    let depth = 0;

    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const mine = (e: DragEvent) => (e.target as Element | null)?.closest?.("[data-drop-zone]") === zone;

    function onDragEnter(e: DragEvent) {
      if (!hasFiles(e)) return;
      depth++;
      zone!.classList.add("drop-active");
    }
    function onDragLeave(e: DragEvent) {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) zone!.classList.remove("drop-active");
    }
    function onDragOver(e: DragEvent) {
      if (!hasFiles(e) || !mine(e)) return;
      e.preventDefault(); // allow the drop
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    }
    function onDrop(e: DragEvent) {
      depth = 0;
      zone!.classList.remove("drop-active");
      if (!hasFiles(e) || !mine(e)) return;
      e.preventDefault();
      const file = Array.from(e.dataTransfer?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (!file) {
        window.alert("Може да се пускат само снимки и GIF-ове.");
        return;
      }
      if (file.size > MAX_BYTES) {
        window.alert("Файлът е над 10 MB — твърде голям за качване.");
        return;
      }
      onImageRef.current(file);
    }

    zone.addEventListener("dragenter", onDragEnter);
    zone.addEventListener("dragleave", onDragLeave);
    zone.addEventListener("dragover", onDragOver);
    zone.addEventListener("drop", onDrop);
    return () => {
      zone.removeEventListener("dragenter", onDragEnter);
      zone.removeEventListener("dragleave", onDragLeave);
      zone.removeEventListener("dragover", onDragOver);
      zone.removeEventListener("drop", onDrop);
      zone.classList.remove("drop-active");
    };
  }, [anchorRef]);
}

/** Stops the browser/Electron from opening an image dropped outside a chat (it would navigate away). */
export function preventStrayFileDrops() {
  const stop = (e: DragEvent) => {
    if (Array.from(e.dataTransfer?.types ?? []).includes("Files")) e.preventDefault();
  };
  window.addEventListener("dragover", stop);
  window.addEventListener("drop", stop);
}
