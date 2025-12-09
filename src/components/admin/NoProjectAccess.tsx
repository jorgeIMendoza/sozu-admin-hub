import { FolderX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface NoProjectAccessProps {
  message?: string;
}

export function NoProjectAccess({ message }: NoProjectAccessProps) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <FolderX className="h-10 w-10 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Sin acceso a proyectos
        </h3>
        <p className="text-muted-foreground max-w-sm">
          {message || "No tienes proyectos asignados. Contacta al administrador para solicitar acceso."}
        </p>
      </CardContent>
    </Card>
  );
}
