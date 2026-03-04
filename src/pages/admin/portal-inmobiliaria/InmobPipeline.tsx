import { useEffect } from "react";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

export default function InmobPipeline() {
  const { registrarVista } = useActivityLogger();
  const { track } = useCtaTracker();

  useEffect(() => {
    registrarVista("/admin/portal-inmobiliaria/pipeline");
    track({ page: "inmob_pipeline", elementId: "page_view", elementType: "page" });
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Pipeline</h1>
      <Card>
        <CardContent className="p-12 text-center">
          <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Vista Kanban del Pipeline — próximamente con datos reales.</p>
        </CardContent>
      </Card>
    </div>
  );
}
