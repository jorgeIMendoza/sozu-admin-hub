import { useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface TrackOptions {
  page: string;
  elementId: string;
  elementLabel?: string;
  elementType?: string;
  metadata?: Record<string, any>;
  abTestId?: number;
  abVariant?: string;
}

export function useCtaTracker() {
  const { user } = useAuth();
  const sessionId = useRef(
    typeof window !== "undefined"
      ? sessionStorage.getItem("cta_session_id") ||
        (() => {
          const id = crypto.randomUUID();
          sessionStorage.setItem("cta_session_id", id);
          return id;
        })()
      : ""
  );

  const track = useCallback(
    async (opts: TrackOptions) => {
      if (!user?.email) return;
      try {
        await supabase.from("cta_events").insert({
          session_id: sessionId.current,
          user_email: user.email,
          auth_user_id: user.id,
          page: opts.page,
          element_id: opts.elementId,
          element_label: opts.elementLabel || null,
          element_type: opts.elementType || "button",
          metadata: opts.metadata || {},
          ab_test_id: opts.abTestId || null,
          ab_variant: opts.abVariant || null,
        });
      } catch {
        // Silent fail — analytics should never break UX
      }
    },
    [user]
  );

  return { track };
}
