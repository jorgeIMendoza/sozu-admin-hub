import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { CreditCard, Eye, Edit, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { NewPaymentSchemeDialog } from "./NewPaymentSchemeDialog";
import { EditPaymentSchemeDialog } from "./EditPaymentSchemeDialog";
import { useToast } from "@/hooks/use-toast";

interface PaymentSchemeManagementProps {
  projectId: number;
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
}

export const PaymentSchemeManagement = ({ projectId, canCreate = true, canUpdate = true, canDelete = true }: PaymentSchemeManagementProps) => {
  const [refreshKey, setRefreshKey] = useState(0);
  const { toast } = useToast();

  const { data: schemes, isLoading, refetch } = useQuery({
    queryKey: ["project-payment-schemes", projectId, refreshKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("esquemas_pago")
        .select("*")
        .match({ 
          id_proyecto: projectId,
          activo: true,
          es_manual: false 
        })
        .order("nombre");
      
      if (error) {
        console.error("Error fetching payment schemes:", error);
        throw error;
      }
      
      return data || [];
    },
    enabled: !!projectId && projectId > 0,
  });

  const handleSchemeAdded = () => {
    setRefreshKey(prev => prev + 1);
    refetch();
  };

  const handleDeleteScheme = async (schemeId: number) => {
    try {
      const { error } = await supabase
        .from("esquemas_pago")
        .update({ activo: false })
        .eq("id", schemeId);

      if (error) throw error;

      toast({
        title: "Esquema eliminado",
        description: "El esquema de pago se ha eliminado exitosamente.",
      });

      handleSchemeAdded();
    } catch (error) {
      console.error("Error deleting payment scheme:", error);
      toast({
        title: "Error",
        description: "Hubo un error al eliminar el esquema de pago.",
        variant: "destructive",
      });
    }
  };

  const DeletePaymentSchemeDialog = ({ scheme }: { scheme: any }) => {
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            disabled={!canDelete}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Eliminar
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esquema de pago?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas eliminar el esquema de pago "<strong>{scheme.nombre}</strong>"? 
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDeleteScheme(scheme.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  };

  const PaymentSchemeDetailsDialog = ({ scheme }: { scheme: any }) => {
    // Convención de porcentaje_descuento_aumento:
    // - Valor positivo: incremento (aumenta el precio)
    // - Valor negativo: descuento (reduce el precio)
    const adjustmentAmount = scheme.porcentaje_descuento_aumento || 0;
    const isIncrement = adjustmentAmount > 0; // Positive = increment (increases price)
    const isDiscount = adjustmentAmount < 0; // Negative = discount (reduces price)
    const hasAdjustment = adjustmentAmount !== 0;

    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Eye className="h-4 w-4 mr-1" />
            Ver Detalles
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalles de {scheme.nombre}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {(() => {
              const hasFixedAmountTramos = Array.isArray(scheme.tramos_mensualidad) && 
                scheme.tramos_mensualidad.length > 0 && 
                scheme.tramos_mensualidad.some((t: any) => t.monto_mensualidad && t.monto_mensualidad > 0);
              
              if (hasFixedAmountTramos) {
                return (
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="font-medium">Enganche:</span> {scheme.porcentaje_enganche}%
                    </div>
                    {scheme.tramos_mensualidad.map((tramo: any, idx: number) => (
                      <div key={idx}>
                        <span className="font-medium">Monto mensual{scheme.tramos_mensualidad.length > 1 ? ` (Tramo ${tramo.orden || idx + 1})` : ''}:</span>{' '}
                        ${(tramo.monto_mensualidad / 100).toLocaleString("es-MX")}/mes
                        {tramo.fecha_limite && (
                          <span className="text-muted-foreground ml-1">(hasta {tramo.fecha_limite})</span>
                        )}
                      </div>
                    ))}
                  </div>
                );
              }

              return (
                <>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Enganche:</span> {scheme.porcentaje_enganche}%
                    </div>
                    <div>
                      <span className="font-medium">Mensualidades:</span> {scheme.porcentaje_mensualidades}%
                    </div>
                    <div>
                      <span className="font-medium">Entrega:</span> {scheme.porcentaje_entrega}%
                    </div>
                    <div>
                      <span className="font-medium">No. Mensualidades:</span> {scheme.numero_mensualidades}
                    </div>
                  </div>
                  {Array.isArray(scheme.tramos_mensualidad) && scheme.tramos_mensualidad.length > 0 && (
                    <div className="pt-2 border-t">
                      <span className="font-medium text-sm">Tramos escalonados:</span>
                      <div className="mt-1 space-y-1">
                        {scheme.tramos_mensualidad.map((tramo: any, idx: number) => (
                          <div key={idx} className="flex items-center gap-2 text-sm">
                            <Badge variant="outline" className="text-xs">Tramo {tramo.orden || idx + 1}</Badge>
                            <span>{tramo.numero_mensualidades} meses</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
            {hasAdjustment && (
              <div className="pt-2 border-t">
                <div className="flex justify-between items-center">
                  <span className="font-medium">
                    {isIncrement ? "Incremento:" : "Descuento:"}
                  </span>
                  <Badge 
                    variant="outline"
                    className={`font-medium ${
                      isIncrement 
                        ? "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/50 dark:text-blue-200 dark:border-blue-700" 
                        : "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/50 dark:text-green-200 dark:border-green-700"
                    }`}
                  >
                    {Math.abs(adjustmentAmount)}%
                  </Badge>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Esquemas de Pago del Proyecto</h3>
        <NewPaymentSchemeDialog 
          projectId={projectId} 
          onSchemeAdded={handleSchemeAdded}
          canCreate={canCreate}
        />
        </div>
        <div>Cargando esquemas de pago...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Esquemas de Pago del Proyecto</h3>
      <NewPaymentSchemeDialog 
        projectId={projectId} 
        onSchemeAdded={handleSchemeAdded}
        canCreate={canCreate}
      />
      </div>

      {schemes && schemes.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {schemes.length} esquema{schemes.length !== 1 ? 's' : ''} encontrado{schemes.length !== 1 ? 's' : ''}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {schemes.map((scheme) => {
              const totalPercentage = scheme.porcentaje_enganche + scheme.porcentaje_mensualidades + scheme.porcentaje_entrega;
              const isValidScheme = totalPercentage === 100;

              return (
                <Card key={scheme.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <CreditCard className="h-4 w-4" />
                        <span>{scheme.nombre}</span>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex space-x-2">
                      <PaymentSchemeDetailsDialog scheme={scheme} />
                      <EditPaymentSchemeDialog 
                        scheme={scheme} 
                        onSchemeUpdated={handleSchemeAdded}
                        canUpdate={canUpdate}
                      />
                      <DeletePaymentSchemeDialog scheme={scheme} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="p-6 text-center">
            <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No hay esquemas de pago creados para este proyecto</p>
            <p className="text-sm text-muted-foreground mt-1">Agrega esquemas de pago para comenzar</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};