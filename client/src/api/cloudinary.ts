const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export function isCloudinaryConfigured(): boolean {
  return Boolean(CLOUD_NAME && UPLOAD_PRESET);
}

export async function uploadImageToCloudinary(file: File | Blob): Promise<string> {
  if (!isCloudinaryConfigured()) {
    throw new Error("Cloudinary is not configured (VITE_CLOUDINARY_CLOUD_NAME / VITE_CLOUDINARY_UPLOAD_PRESET)");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Cloudinary upload failed: ${res.status}`);
  }

  const data = await res.json();
  return data.secure_url as string;
}

/**
 * Uploads a video/audio recording (stream clips, voice messages) with progress (0..1).
 * Cloudinary files audio under the "video" resource type too.
 */
export function uploadMediaToCloudinary(
  file: Blob,
  onProgress?: (fraction: number) => void,
): Promise<{ url: string; durationMs: number }> {
  if (!isCloudinaryConfigured()) {
    return Promise.reject(new Error("Cloudinary is not configured (VITE_CLOUDINARY_CLOUD_NAME / VITE_CLOUDINARY_UPLOAD_PRESET)"));
  }
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) return reject(new Error(`Cloudinary upload failed: ${xhr.status}`));
      try {
        const data = JSON.parse(xhr.responseText);
        resolve({ url: data.secure_url as string, durationMs: Math.round(Number(data.duration ?? 0) * 1000) });
      } catch (err) {
        reject(err);
      }
    };
    xhr.onerror = () => reject(new Error("Cloudinary upload failed: network"));
    xhr.send(formData);
  });
}

/** Uploads a short audio clip (soundboard). Cloudinary files audio under the "video" resource type. */
export async function uploadAudioToCloudinary(file: File | Blob): Promise<{ url: string; durationMs: number }> {
  if (!isCloudinaryConfigured()) {
    throw new Error("Cloudinary is not configured (VITE_CLOUDINARY_CLOUD_NAME / VITE_CLOUDINARY_UPLOAD_PRESET)");
  }
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`, { method: "POST", body: formData });
  if (!res.ok) throw new Error(`Cloudinary upload failed: ${res.status}`);
  const data = await res.json();
  return { url: data.secure_url as string, durationMs: Math.round(Number(data.duration ?? 0) * 1000) };
}
