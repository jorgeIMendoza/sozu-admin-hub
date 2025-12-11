import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { CreditCard, Eye, Edit, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { NewProductPaymentSchemeDialog } from "./NewProductPaymentSchemeDialog";
import { EditProductPaymentSchemeDialog } from "./EditProductPaymentSchemeDialog";
import { useToast } from "@/hooks/use-toast";

interface ProductPaymentSchemeManagementProps {
  productId: number;
  productName: string;
}

export const ProductPaymentSchemeManagement = ({ productId, productName }: ProductPaymentSchemeManagementProps) => {
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { toast } = useToast();

  // Always fetch count for display in the button
  const { data: schemeCount = 0 } = useQuery({
    queryKey: ["product-payment-schemes-count", productId, refreshKey],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("esquemas_pago")
        .select("id", { count: 'exact', head: true })
        .match({ 
          id_producto: productId,
          activo: true,
          es_manual: false 
        });
      
      if (error) {
        console.error("Error fetching product payment schemes count:", error);
        return 0;
      }
      
      return count || 0;
    },
    enabled: !!productId && productId > 0,
  });

  // Fetch full schemes data when dialog is open
  const { data: schemes, isLoading, refetch } = useQuery({
    queryKey: ["product-payment-schemes", productId, refreshKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("esquemas_pago")
        .select("*")
        .match({ 
          id_producto: productId,
          activo: true,
          es_manual: false 
        })
        .order("nombre");
      
      if (error) {
        console.error("Error fetching product payment schemes:", error);
        throw error;
      }
      
      return data || [];
    },
    enabled: !!productId && productId > 0 && open,
  });

  const handleSchemeAdded = () => {
    setRefreshKey(prev => prev + 1);
    refetch();
  };

  const queryClient = useQueryClient();

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
    const adjustmentAmount = scheme.porcentaje_descuento_aumento || 0;
    const isIncrement = adjustmentAmount > 0;
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-8 px-3 gap-1.5 hover:bg-primary/10"
        >
          <CreditCard className="h-4 w-4" />
          <Badge 
            variant="secondary" 
            className={`h-5 min-w-[20px] px-1.5 text-xs font-medium ${
              schemeCount > 0 
                ? "bg-primary/20 text-primary" 
                : "bg-muted text-muted-foreground"
            }`}
          >
            {schemeCount}
          </Badge>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Esquemas de Pago - {productName}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Gestiona los esquemas de pago para este producto
            </p>
            <NewProductPaymentSchemeDialog 
              productId={productId} 
              onSchemeAdded={handleSchemeAdded} 
            />
          </div>

          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">
              Cargando esquemas de pago...
            </div>
          ) : schemes && schemes.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {schemes.length} esquema{schemes.length !== 1 ? 's' : ''} encontrado{schemes.length !== 1 ? 's' : ''}
              </p>
              <div className="grid grid-cols-1 gap-4">
                {schemes.map((scheme) => (
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
                        <EditProductPaymentSchemeDialog 
                          scheme={scheme} 
                          onSchemeUpdated={handleSchemeAdded} 
                        />
                        <DeletePaymentSchemeDialog scheme={scheme} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <Card>
              <CardContent className="p-6 text-center">
                <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No hay esquemas de pago creados para este producto</p>
                <p className="text-sm text-muted-foreground mt-1">Agrega esquemas de pago para poder generar ofertas precargadas</p>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
