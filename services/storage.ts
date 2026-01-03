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
    maxSizeMB: 0.5,           // Reduced to 0.5MB to be friendly to DB storage
    maxWidthOrHeight: 1280,   // Standard HD is sufficient for proofs
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
 * Simulates an upload by converting the file to a Base64 Data URI.
 * This removes the dependency on external storage buckets (R2/S3) for the demo,
 * allowing the app to function with just Supabase database storage.
 */
export const uploadToR2 = async (file: File, userId: string, folder: 'tasks' | 'screentime') => {
  // Optimize first to keep base64 string size manageable
  const optimizedFile = await optimizeFile(file);
  
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(optimizedFile);
  });
};