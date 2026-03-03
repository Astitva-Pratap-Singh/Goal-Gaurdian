import imageCompression from 'browser-image-compression';

/**
 * Optimizes an image file by compressing/resizing it.
 * Returns original file if it's not an image (e.g. PDF).
 */
export const optimizeFile = async (file: File): Promise<File> => {
  // If it's a PDF or non-image, return as is
  if (!file.type.startsWith('image/')) {
    return file;
  }

  const options = {
    maxSizeMB: 0.2,           // Aggressively compress to 200KB for Firestore storage
    maxWidthOrHeight: 1024,   // Resize to standard HD
    useWebWorker: true,
  };

  try {
    const compressedBlob = await imageCompression(file, options);
    // Convert Blob back to File to preserve name/metadata
    return new File([compressedBlob], file.name, {
      type: compressedBlob.type,
      lastModified: Date.now(),
    });
  } catch (error) {
    console.warn("Image optimization failed, using original file.", error);
    return file;
  }
};

/**
 * Converts a file to a Base64 string for storage directly in Firestore.
 * NOTE: Firestore documents have a 1MB limit. We must compress images heavily.
 */
export const uploadFile = async (file: File, path: string): Promise<string> => {
  // 1. Optimize the image first to ensure it fits in Firestore
  const optimizedFile = await optimizeFile(file);
  
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(optimizedFile);
  });
};
