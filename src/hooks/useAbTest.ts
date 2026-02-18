import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Hook to determine which A/B test variant a user is assigned to.
 * Auto-assigns on first visit using random distribution.
 */
export function useAbTest(pagina: string) {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["ab-test-variant", pagina, user?.id],
    queryFn: async () => {
      if (!user?.id || !user?.email) return { variant: "A", testId: null };

      // Find active test for this page
      const { data: tests } = await supabase
        .from("ab_tests")
        .select("*")
        .eq("pagina", pagina)
        .eq("activo", true)
        .limit(1);

      const test = tests?.[0];
      if (!test) return { variant: "A", testId: null };

      // Check existing assignment
      const { data: existing } = await supabase
        .from("ab_test_assignments")
        .select("variante")
        .eq("ab_test_id", test.id)
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (existing) {
        return { variant: existing.variante, testId: test.id };
      }

      // Auto-assign randomly based on distribution
      const dist = (test.porcentaje_distribucion as Record<string, number>) || { A: 50, B: 50 };
      const rand = Math.random() * 100;
      let cumulative = 0;
      let assignedVariant = "A";
      for (const [v, pct] of Object.entries(dist)) {
        cumulative += pct;
        if (rand < cumulative) {
          assignedVariant = v;
          break;
        }
      }

      // Insert assignment
      await supabase.from("ab_test_assignments").insert({
        ab_test_id: test.id,
        auth_user_id: user.id,
        user_email: user.email,
        variante: assignedVariant,
      });

      return { variant: assignedVariant, testId: test.id };
    },
    enabled: !!user?.id,
    staleTime: Infinity, // Assignment never changes
  });

  return {
    variant: data?.variant || "A",
    testId: data?.testId || null,
    isLoading,
  };
}
