import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ImageUploadField } from "@/components/admin/ImageUploadField";

interface BankAccountsSectionProps {
  personId: number;
  showStpCheckbox?: boolean;
  projectId?: number;
}

export function BankAccountsSection({ personId, showStpCheckbox = false, projectId }: BankAccountsSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [newAccount, setNewAccount] = useState({
    id_banco: "",
    numero_cuenta: "",
    cuenta_clabe: "",
    cuenta_swift: "",
    url_evidencia: "",
    es_cuenta_fisica_para_stp: false
  });

  // Fetch available banks
  const { data: banks = [] } = useQuery({
    queryKey: ['banks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bancos')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre', { ascending: true });
      
      if (error) throw error;
      return data || [];
    }
  });

  // Fetch bank accounts with bank names
  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bankAccounts', personId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cuentas_bancarias')
        .select(`
          *,
          banco:bancos(nombre)
        `)
        .eq('id_persona', personId)
        .eq('activo', true)
        .order('fecha_creacion', { ascending: false });
      
      if (error) throw error;
      return data || [];
    }
  });

  // Check if person has "Dueño Vendedor" or "Aportante" entity type for this project
  const { data: entityData } = useQuery({
    queryKey: ['person_entity_type', personId, projectId],
    queryFn: async () => {
      // If no projectId, check if person has any "Dueño Vendedor" or "Aportante" entity type
      if (!projectId) {
        const { data, error } = await supabase
          .from('entidades_relacionadas')
          .select('id_tipo_entidad')
          .eq('id_persona', personId)
          .in('id_tipo_entidad', [4, 15]) // "Dueño Vendedor" or "Aportante"
          .eq('activo', true)
          .limit(1)
          .single();
        
        if (error) return null;
        return data;
      }
      
      const { data, error } = await supabase
        .from('entidades_relacionadas')
        .select('id_tipo_entidad')
        .eq('id_persona', personId)
        .eq('id_proyecto', projectId)
        .eq('activo', true)
        .single();
      
      if (error) return null;
      return data;
    },
    enabled: showStpCheckbox
  });

  // Check if there's already an STP account for this project (or globally if no project)
  const { data: existingStpAccount } = useQuery({
    queryKey: ['existing_stp_account', projectId, personId],
    queryFn: async () => {
      if (!projectId) {
        // If no project, just check if this person already has an STP account
        const { data, error } = await supabase
          .from('cuentas_bancarias')
          .select('id, id_persona')
          .eq('id_persona', personId)
          .eq('es_cuenta_fisica_para_stp', true)
          .eq('activo', true)
          .single();
        
        if (error) return null;
        return data;
      }
      
      const { data, error } = await supabase
        .from('cuentas_bancarias')
        .select('id, id_persona')
        .eq('es_cuenta_fisica_para_stp', true)
        .eq('activo', true);
      
      if (error) throw error;
      
      // Filter by project through entidades_relacionadas
      if (data && data.length > 0) {
        for (const account of data) {
          const { data: entityCheck } = await supabase
            .from('entidades_relacionadas')
            .select('id')
            .eq('id_persona', account.id_persona)
            .eq('id_proyecto', projectId)
            .eq('activo', true);
          
          if (entityCheck && entityCheck.length > 0) {
            return account;
          }
        }
      }
      return null;
    },
    enabled: showStpCheckbox
  });

  const shouldShowStpCheckbox = showStpCheckbox && 
    entityData && 
    (entityData.id_tipo_entidad === 4 || entityData.id_tipo_entidad === 15); // "Dueño Vendedor" or "Aportante"

  const addMutation = useMutation({
    mutationFn: async (accountData: typeof newAccount) => {
      // If trying to set STP account, check if another exists
      if (accountData.es_cuenta_fisica_para_stp && existingStpAccount && existingStpAccount.id_persona !== personId) {
        if (projectId) {
          throw new Error('Ya existe una cuenta STP para este proyecto');
        } else {
          throw new Error('Esta persona ya tiene una cuenta STP');
        }
      }

      const { data, error } = await supabase
        .from('cuentas_bancarias')
        .insert([{
          ...accountData,
          id_banco: parseInt(accountData.id_banco),
          id_persona: personId,
          url_evidencia: accountData.url_evidencia || null,
          cuenta_clabe: accountData.cuenta_clabe || null,
          cuenta_swift: accountData.cuenta_swift || null
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bankAccounts', personId] });
      setNewAccount({
        id_banco: "",
        numero_cuenta: "",
        cuenta_clabe: "",
        cuenta_swift: "",
        url_evidencia: "",
        es_cuenta_fisica_para_stp: false
      });
      setIsAdding(false);
      toast({ title: "Cuenta bancaria agregada exitosamente" });
    },
    onError: () => {
      toast({ title: "Error al agregar cuenta bancaria", variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (accountId: number) => {
      const { error } = await supabase
        .from('cuentas_bancarias')
        .update({ activo: false })
        .eq('id', accountId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bankAccounts', personId] });
      toast({ title: "Cuenta bancaria eliminada exitosamente" });
    },
    onError: () => {
      toast({ title: "Error al eliminar cuenta bancaria", variant: "destructive" });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccount.id_banco || !newAccount.numero_cuenta) {
      toast({ title: "Por favor completa los campos requeridos", variant: "destructive" });
      return;
    }

    // Validate account number length based on STP checkbox
    const accountLength = newAccount.numero_cuenta.length;
    if (newAccount.es_cuenta_fisica_para_stp) {
      if (accountLength !== 18) {
        toast({ 
          title: "Error de validación", 
          description: "Las cuentas STP deben tener exactamente 18 dígitos",
          variant: "destructive" 
        });
        return;
      }
    } else {
      if (accountLength < 8 || accountLength > 34) {
        toast({ 
          title: "Error de validación", 
          description: "El número de cuenta debe tener entre 8 y 34 caracteres",
          variant: "destructive" 
        });
        return;
      }
    }

    addMutation.mutate(newAccount);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Cuentas Bancarias</h3>
        <Button
          onClick={() => setIsAdding(true)}
          disabled={isAdding}
        >
          <Plus className="w-4 h-4 mr-2" />
          Agregar Cuenta
        </Button>
      </div>

      {isAdding && (
        <Card>
          <CardHeader>
            <CardTitle>Nueva Cuenta Bancaria</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="id_banco">Banco *</Label>
                <Select 
                  value={newAccount.id_banco} 
                  onValueChange={(value) => setNewAccount(prev => ({ ...prev, id_banco: value }))}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un banco" />
                  </SelectTrigger>
                  <SelectContent>
                    {banks.map((bank) => (
                      <SelectItem key={bank.id} value={bank.id.toString()}>
                        {bank.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="numero_cuenta">Número de Cuenta *</Label>
                <Input
                  id="numero_cuenta"
                  value={newAccount.numero_cuenta}
                  onChange={(e) => setNewAccount(prev => ({ ...prev, numero_cuenta: e.target.value }))}
                  placeholder={newAccount.es_cuenta_fisica_para_stp ? "18 dígitos exactos" : "Entre 8 y 34 caracteres"}
                  maxLength={18}
                  required
                />
              </div>

              <div>
                <Label htmlFor="cuenta_clabe">CLABE</Label>
                <Input
                  id="cuenta_clabe"
                  value={newAccount.cuenta_clabe}
                  onChange={(e) => setNewAccount(prev => ({ ...prev, cuenta_clabe: e.target.value }))}
                  placeholder="18 dígitos (opcional)"
                  maxLength={18}
                />
              </div>

              <div>
                <Label htmlFor="cuenta_swift">Código SWIFT</Label>
                <Input
                  id="cuenta_swift"
                  value={newAccount.cuenta_swift}
                  onChange={(e) => setNewAccount(prev => ({ ...prev, cuenta_swift: e.target.value }))}
                  placeholder="8 u 11 caracteres (opcional)"
                />
              </div>

              <ImageUploadField
                label="Evidencia"
                value={newAccount.url_evidencia}
                onChange={(url) => setNewAccount(prev => ({ ...prev, url_evidencia: url }))}
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
              />

              {shouldShowStpCheckbox && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="es_cuenta_fisica_para_stp"
                    checked={newAccount.es_cuenta_fisica_para_stp}
                    onCheckedChange={(checked) => 
                      setNewAccount(prev => ({ ...prev, es_cuenta_fisica_para_stp: checked as boolean }))
                    }
                    disabled={existingStpAccount && existingStpAccount.id_persona !== personId}
                  />
                  <Label htmlFor="es_cuenta_fisica_para_stp">
                    Es cuenta física para STP
                    {existingStpAccount && existingStpAccount.id_persona !== personId && (
                      <span className="text-xs text-muted-foreground block">
                        {projectId ? '(Ya existe una cuenta STP para este proyecto)' : '(Esta persona ya tiene una cuenta STP)'}
                      </span>
                    )}
                  </Label>
                </div>
              )}

              <div className="flex gap-2">
                <Button type="submit" disabled={addMutation.isPending}>
                  {addMutation.isPending ? "Guardando..." : "Guardar"}
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsAdding(false)}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {bankAccounts.map((account) => (
          <Card key={account.id}>
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <p><strong>Banco:</strong> {account.banco?.nombre || 'N/A'}</p>
                  <p><strong>Número de Cuenta:</strong> {account.numero_cuenta}</p>
                  {account.cuenta_clabe && (
                    <p><strong>CLABE:</strong> {account.cuenta_clabe}</p>
                  )}
                  {account.cuenta_swift && (
                    <p><strong>SWIFT:</strong> {account.cuenta_swift}</p>
                  )}
                  {account.url_evidencia && (
                    <p>
                      <strong>Evidencia:</strong>{" "}
                      <a 
                        href={account.url_evidencia} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        Ver documento
                      </a>
                    </p>
                  )}
                   {shouldShowStpCheckbox && account.es_cuenta_fisica_para_stp && (
                    <p className="text-sm text-green-600 font-medium">✓ Cuenta física para STP</p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => deleteMutation.mutate(account.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {bankAccounts.length === 0 && !isAdding && (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground">No hay cuentas bancarias registradas</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}