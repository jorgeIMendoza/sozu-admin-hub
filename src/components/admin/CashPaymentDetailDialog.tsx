import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DollarSign, ChevronDown, ChevronUp } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface CashPayment {
  fecha_pago: string;
  monto: number;
}

interface CashPaymentDetailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  cashLimit: number;
  cashPaid: number;
  cashRemaining: number;
  cashPercentage: number;
  cashPayments: CashPayment[];
}

export function CashPaymentDetailDialog({
  isOpen,
  onClose,
  cashLimit,
  cashPaid,
  cashRemaining,
  cashPercentage,
  cashPayments
}: CashPaymentDetailDialogProps) {
  const [isPaymentsOpen, setIsPaymentsOpen] = useState(false);
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Detalle de Pagos en Efectivo
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Límite de efectivo:</span>
              <span className="font-semibold text-lg">{formatCurrency(cashLimit)}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Pagado en efectivo:</span>
              <span className="font-semibold text-lg text-blue-600">{formatCurrency(cashPaid)}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Aún permitido:</span>
              <span className="font-semibold text-lg text-green-600">{formatCurrency(cashRemaining)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Porcentaje utilizado:</span>
              <span className={`font-semibold ${
                cashPercentage >= 85 ? 'text-red-600' :
                cashPercentage >= 75 ? 'text-yellow-600' :
                'text-green-600'
              }`}>
                {cashPercentage.toFixed(2)}%
              </span>
            </div>
            <Progress 
              value={cashPercentage} 
              className="h-3"
            />
            {cashPercentage >= 85 && (
              <p className="text-sm text-red-600 font-medium">
                ⚠️ Límite de efectivo casi alcanzado
              </p>
            )}
            {cashPercentage >= 75 && cashPercentage < 85 && (
              <p className="text-sm text-yellow-600 font-medium">
                ⚠️ Acercándose al límite de efectivo
              </p>
            )}
          </div>

          {cashPayments.length > 0 && (
            <Collapsible open={isPaymentsOpen} onOpenChange={setIsPaymentsOpen} className="mt-4">
              <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg border bg-muted/50 hover:bg-muted transition-colors">
                <span className="font-medium text-sm">
                  Ver todos los pagos en efectivo ({cashPayments.length})
                </span>
                {isPaymentsOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-muted px-3 py-2 grid grid-cols-2 gap-4 text-sm font-medium">
                    <span>Fecha</span>
                    <span className="text-right">Monto</span>
                  </div>
                  <div className="divide-y">
                    {cashPayments.map((payment, index) => (
                      <div key={index} className="px-3 py-2 grid grid-cols-2 gap-4 text-sm hover:bg-muted/30 transition-colors">
                        <span className="text-muted-foreground">
                          {format(new Date(payment.fecha_pago), "dd/MMM/yyyy", { locale: es })}
                        </span>
                        <span className="text-right font-semibold text-blue-600">
                          {formatCurrency(payment.monto)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
