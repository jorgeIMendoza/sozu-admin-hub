import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ReciboPagoData {
  pagoId: number;
}

export class ReciboPagoService {
  /**
   * Genera un recibo de pago usando el Edge Function centralizado.
   * El PDF se genera en el servidor y se descarga automáticamente.
   */
  async generateRecibo(data: ReciboPagoData): Promise<string | null> {
    try {
      console.log('Calling generar-recibo-pago Edge Function with pagoId:', data.pagoId);
      
      const { data: response, error } = await supabase.functions.invoke('generar-recibo-pago', {
        body: { pagoId: data.pagoId }
      });

      if (error) {
        console.error('Error calling Edge Function:', error);
        toast.error('Error al generar el recibo de pago');
        throw error;
      }

      if (!response?.success || !response?.url_recibo) {
        console.error('Invalid response from Edge Function:', response);
        toast.error(response?.error || 'Error al generar el recibo de pago');
        return null;
      }

      console.log('Recibo generated successfully:', response.url_recibo);
      
      // Open the PDF in a new tab
      window.open(response.url_recibo, '_blank');
      
      return response.url_recibo;
    } catch (error) {
      console.error('Error generating recibo:', error);
      throw error;
    }
  }
}

// Export a singleton instance for convenience
export const reciboPagoService = new ReciboPagoService();
