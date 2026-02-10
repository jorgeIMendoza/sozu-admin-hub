import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface EstadoCuentaEdgeFunctionData {
  id_cuenta: number;
}

export class EstadoCuentaEdgeFunctionService {
  async generateEstadoCuenta(data: EstadoCuentaEdgeFunctionData): Promise<string | null> {
    try {
      console.log('Calling generar-estado-cuenta Edge Function with id_cuenta:', data.id_cuenta);
      
      const { data: response, error } = await supabase.functions.invoke('generar-estado-cuenta', {
        body: { id_cuenta: data.id_cuenta }
      });

      if (error) {
        console.error('Error calling Edge Function:', error);
        toast.error('Error al generar el estado de cuenta');
        throw error;
      }

      if (!response?.success || !response?.url_estado_cuenta) {
        console.error('Invalid response from Edge Function:', response);
        toast.error(response?.error || 'Error al generar el estado de cuenta');
        return null;
      }

      console.log('Estado de cuenta generated successfully:', response.url_estado_cuenta);
      
      // Open the PDF in a new tab
      window.open(response.url_estado_cuenta, '_blank');
      
      return response.url_estado_cuenta;
    } catch (error) {
      console.error('Error generating estado de cuenta:', error);
      throw error;
    }
  }
}

export const estadoCuentaEdgeFunctionService = new EstadoCuentaEdgeFunctionService();
