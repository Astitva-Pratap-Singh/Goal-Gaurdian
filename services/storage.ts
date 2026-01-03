import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import imageCompression from 'browser-image-compression';

// Helper to safely get Env Vars
const getEnv = (key: string) => {
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    // @ts-ignore
    return import.meta.env[`VITE_${key}`] || import.meta.env[key];
  }
  // @ts-ignore
  if (typeof process !== 'undefined' && process.env) {
    // @ts-ignore
    return process.env[`REACT_APP_${key}`] || process.env[key];
  }
  return "";
};

const R2_ACCOUNT_ID = getEnv('R2_ACCOUNT_ID');
const R2_ACCESS_KEY_ID = getEnv('R2_ACCESS_KEY_ID');
const R2_SECRET_ACCESS_KEY = getEnv('R2_SECRET_ACCESS_KEY');
const R2_BUCKET_NAME = getEnv('R2_BUCKET_NAME');
const R2_PUBLIC_DOMAIN = getEnv('R2_PUBLIC_DOMAIN');

// Initialize S3 Client for Cloudflare R2
const R2 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

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
    maxSizeMB: 1,           // Max file size 1MB
    maxWidthOrHeight: 1920, // Max dimension 1920px
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
 * Uploads a file to Cloudflare R2 bucket.
 * Returns the public URL.
 */
export const uploadToR2 = async (file: File, userId: string, folder: 'tasks' | 'screentime') => {
  if (!R2_BUCKET_NAME || !R2_ACCESS_KEY_ID) {
    throw new Error("R2 Storage configuration missing.");
  }

  // 1. Optimize
  const optimizedFile = await optimizeFile(file);

  // 2. Prepare Path
  const fileExt = optimizedFile.name.split('.').pop();
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
  const key = `${userId}/${folder}/${fileName}`;

  // 3. Upload
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: optimizedFile,
    ContentType: optimizedFile.type,
    // ACL: 'public-read' // R2 usually handles public access via bucket settings or public domain
  });

  await R2.send(command);

  // 4. Return Public URL
  // If a custom domain is set, use it. Otherwise construct standard R2 dev URL if applicable, 
  // but R2 requires a public domain enabled for easy HTTP access.
  const baseUrl = R2_PUBLIC_DOMAIN.startsWith('http') ? R2_PUBLIC_DOMAIN : `https://${R2_PUBLIC_DOMAIN}`;
  
  // Ensure no double slashes between domain and key
  const finalUrl = `${baseUrl.replace(/\/$/, '')}/${key}`;
  
  return finalUrl;
};