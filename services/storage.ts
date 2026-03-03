import { storage } from './firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
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
 * Uploads a file to Firebase Storage and returns the download URL.
 */
export const uploadFile = async (file: File, path: string): Promise<string> => {
  const optimizedFile = await optimizeFile(file);
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, optimizedFile);
  return await getDownloadURL(storageRef);
};
