import { useEffect } from "react";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";

export default function InmobReportes() {
  const { registrarVista } = useActivityLogger();
  const { track } = useCtaTracker();

  useEffect(() => {
    registrarVista("/admin/portal-inmobiliaria/reportes");
    track({ page: "inmob_reportes", elementId: "page_view", elementType: "page" });
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Reportes</h1>
      <Card>
        <CardContent className="p-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Módulo de Reportes — próximamente con datos reales.</p>
        </CardContent>
      </Card>
    </div>
  );
}
