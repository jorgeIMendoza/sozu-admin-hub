/**
 * Utility functions for handling Google Drive URLs
 */

/**
 * Extracts the file ID from a Google Drive URL
 * Supports formats:
 * - https://drive.google.com/file/d/{ID}/preview
 * - https://drive.google.com/file/d/{ID}/view
 * - https://drive.google.com/open?id={ID}
 * - https://drive.google.com/uc?id={ID}
 */
export function extractGoogleDriveFileId(url: string): string | null {
  if (!url) return null;
  
  // Format: /file/d/{ID}/
  const fileIdMatch = url.match(/\/file\/d\/([^/]+)/);
  if (fileIdMatch) {
    return fileIdMatch[1];
  }
  
  // Format: ?id={ID} or &id={ID}
  const idParamMatch = url.match(/[?&]id=([^&]+)/);
  if (idParamMatch) {
    return idParamMatch[1];
  }
  
  return null;
}

/**
 * Checks if a URL is a Google Drive URL
 */
export function isGoogleDriveUrl(url: string): boolean {
  if (!url) return false;
  return url.includes('drive.google.com');
}

/**
 * Converts a Google Drive URL to a direct download URL
 * From: https://drive.google.com/file/d/{ID}/preview
 * To: https://drive.google.com/uc?export=download&id={ID}
 */
export function convertToGoogleDriveDownloadUrl(url: string): string {
  const fileId = extractGoogleDriveFileId(url);
  if (!fileId) return url;
  
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

/**
 * Converts a Google Drive URL to a preview URL
 * From: https://drive.google.com/uc?id={ID}
 * To: https://drive.google.com/file/d/{ID}/preview
 */
export function convertToGoogleDrivePreviewUrl(url: string): string {
  const fileId = extractGoogleDriveFileId(url);
  if (!fileId) return url;
  
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

/**
 * Gets a downloadable URL for any document
 * - Google Drive URLs are converted to direct download URLs
 * - Other URLs (Supabase, etc.) are returned as-is
 */
export function getDownloadableUrl(url: string): string {
  if (isGoogleDriveUrl(url)) {
    return convertToGoogleDriveDownloadUrl(url);
  }
  return url;
}

/**
 * Triggers a download for a document URL
 * Opens in a new tab for Google Drive files (due to their redirect behavior)
 * Uses direct download for other URLs
 */
export function downloadDocument(url: string, filename?: string): void {
  const downloadUrl = getDownloadableUrl(url);
  
  if (isGoogleDriveUrl(url)) {
    // Google Drive requires opening in a new tab due to redirects
    window.open(downloadUrl, '_blank');
  } else {
    // For other URLs, we can do a proper download
    const link = document.createElement('a');
    link.href = downloadUrl;
    if (filename) {
      link.download = filename;
    }
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
