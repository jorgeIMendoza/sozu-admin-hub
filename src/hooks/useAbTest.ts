import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Hook to determine which A/B test variant a user is assigned to.
 * - Active test: checks existing assignment, or alternates A/B based on last assignment.
 * - Inactive test with variante_ganadora: returns the winner for everyone.
 * - No test or inactive without winner: returns "A".
 */
export function useAbTest(pagina: string) {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["ab-test-variant", pagina, user?.id],
    queryFn: async () => {
      if (!user?.id || !user?.email) return { variant: "A", testId: null };

      // 1. Check for active test
      const { data: activeTests } = await supabase
        .from("ab_tests")
        .select("*")
        .eq("pagina", pagina)
        .eq("activo", true)
        .limit(1);

      const activeTest = activeTests?.[0];

      if (activeTest) {
        // Check existing assignment
        const { data: existing } = await supabase
          .from("ab_test_assignments")
          .select("variante")
          .eq("ab_test_id", activeTest.id)
          .eq("auth_user_id", user.id)
          .maybeSingle();

        if (existing) {
          return { variant: existing.variante, testId: activeTest.id };
        }

        // Alternating assignment: check last assignment for this test
        const { data: lastAssignments } = await supabase
          .from("ab_test_assignments")
          .select("variante")
          .eq("ab_test_id", activeTest.id)
          .order("assigned_at", { ascending: false })
          .limit(1);

        const lastVariant = lastAssignments?.[0]?.variante;
        const assignedVariant = lastVariant === "A" ? "B" : "A";

        // Insert assignment
        await supabase.from("ab_test_assignments").insert({
          ab_test_id: activeTest.id,
          auth_user_id: user.id,
          user_email: user.email,
          variante: assignedVariant,
        });

        return { variant: assignedVariant, testId: activeTest.id };
      }

      // 2. Check for inactive test with variante_ganadora
      const { data: inactiveTests } = await supabase
        .from("ab_tests")
        .select("id, variante_ganadora")
        .eq("pagina", pagina)
        .eq("activo", false)
        .not("variante_ganadora", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1);

      const inactiveTest = inactiveTests?.[0];
      if (inactiveTest?.variante_ganadora) {
        return { variant: inactiveTest.variante_ganadora, testId: inactiveTest.id };
      }

      // 3. Default
      return { variant: "A", testId: null };
    },
    enabled: !!user?.id,
    staleTime: Infinity,
  });

  return {
    variant: data?.variant || "A",
    testId: data?.testId || null,
    isLoading,
  };
}
