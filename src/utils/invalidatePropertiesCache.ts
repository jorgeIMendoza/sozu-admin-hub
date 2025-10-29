/**
 * Utility to force refresh properties data after database updates
 * This ensures the UI reflects the latest database values
 */
export const forceRefreshProperties = () => {
  // Force a page reload to clear all React Query caches
  window.location.reload();
};
