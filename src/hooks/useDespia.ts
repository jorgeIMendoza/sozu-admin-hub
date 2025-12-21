import { useEffect, useState, useCallback } from 'react';

interface DespiaContext {
  isNative: boolean;
  platform: 'ios' | 'android' | 'web';
  safeAreaInsets: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
}

interface DespiaHook extends DespiaContext {
  hapticFeedback: (type?: 'light' | 'medium' | 'heavy') => void;
  setStatusBarStyle: (style: 'light' | 'dark') => void;
  shareContent: (options: { title?: string; text?: string; url?: string }) => Promise<void>;
  openExternalUrl: (url: string) => void;
}

declare global {
  interface Window {
    Despia?: {
      hapticFeedback?: (type: string) => void;
      setStatusBarStyle?: (style: string) => void;
      share?: (options: { title?: string; text?: string; url?: string }) => Promise<void>;
      openUrl?: (url: string) => void;
      getSafeAreaInsets?: () => { top: number; bottom: number; left: number; right: number };
      getPlatform?: () => 'ios' | 'android';
    };
  }
}

export const useDespia = (): DespiaHook => {
  const [context, setContext] = useState<DespiaContext>({
    isNative: false,
    platform: 'web',
    safeAreaInsets: { top: 0, bottom: 0, left: 0, right: 0 },
  });

  useEffect(() => {
    // Detect if running in Despia native context
    const isDespiaNative = typeof window !== 'undefined' && 
      (navigator.userAgent.includes('Despia') || window.Despia !== undefined);

    if (isDespiaNative && window.Despia) {
      const platform = window.Despia.getPlatform?.() || 'ios';
      const safeAreaInsets = window.Despia.getSafeAreaInsets?.() || { top: 0, bottom: 0, left: 0, right: 0 };
      
      setContext({
        isNative: true,
        platform,
        safeAreaInsets,
      });
    }
  }, []);

  const hapticFeedback = useCallback((type: 'light' | 'medium' | 'heavy' = 'medium') => {
    if (context.isNative && window.Despia?.hapticFeedback) {
      window.Despia.hapticFeedback(type);
    }
  }, [context.isNative]);

  const setStatusBarStyle = useCallback((style: 'light' | 'dark') => {
    if (context.isNative && window.Despia?.setStatusBarStyle) {
      window.Despia.setStatusBarStyle(style);
    }
  }, [context.isNative]);

  const shareContent = useCallback(async (options: { title?: string; text?: string; url?: string }) => {
    if (context.isNative && window.Despia?.share) {
      await window.Despia.share(options);
    } else if (navigator.share) {
      await navigator.share(options);
    }
  }, [context.isNative]);

  const openExternalUrl = useCallback((url: string) => {
    if (context.isNative && window.Despia?.openUrl) {
      window.Despia.openUrl(url);
    } else {
      window.open(url, '_blank');
    }
  }, [context.isNative]);

  return {
    ...context,
    hapticFeedback,
    setStatusBarStyle,
    shareContent,
    openExternalUrl,
  };
};

export default useDespia;
