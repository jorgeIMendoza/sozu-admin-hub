import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ImageUploadField } from "@/components/admin/ImageUploadField";
import { Badge } from "@/components/ui/badge";

interface BankAccountsSectionProps {
  personId: number;
  showStpCheckbox?: boolean;
  projectId?: number;
  onEditingStateChange?: (isEditing: boolean) => void;
  onAddAccountClick?: () => void;
  onSaveAccountClick?: () => void;
}

export function BankAccountsSection({ personId, showStpCheckbox = false, projectId, onEditingStateChange, onAddAccountClick, onSaveAccountClick }: BankAccountsSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const [newAccount, setNewAccount] = useState({
    id_banco: "",
    numero_cuenta: "",
    cuenta_clabe: "",
    cuenta_swift: "",
    url_evidencia: "",
    es_cuenta_fisica_para_stp: false
  });

  // Notify parent when editing state changes
  useEffect(() => {
    const isEditing = isAdding || !!editingAccount;
    onEditingStateChange?.(isEditing);
  }, [isAdding, editingAccount, onEditingStateChange]);

  // Reset editing state when component unmounts
  useEffect(() => {
    return () => {
      onEditingStateChange?.(false);
    };
  }, [onEditingStateChange]);

  // Ensure personId is a valid number
  const validPersonId = typeof personId === 'number' && personId > 0 ? personId : null;

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
  const { data: bankAccounts = [], isLoading: loadingAccounts, refetch: refetchBankAccounts } = useQuery({
    queryKey: ['bankAccounts', validPersonId],
    queryFn: async () => {
      if (!validPersonId) return [];
      const { data, error } = await supabase
        .from('cuentas_bancarias')
        .select(`
          *,
          banco:bancos(nombre)
        `)
        .eq('id_persona', validPersonId)
        .eq('activo', true)
        .order('fecha_creacion', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!validPersonId,
  });

  // Check if person has "Dueño Vendedor" or "Aportante" entity type for this project
  const { data: entityData } = useQuery({
    queryKey: ['person_entity_type', validPersonId, projectId],
    queryFn: async () => {
      if (!validPersonId) return null;
      
      // If no projectId, check if person has any "Dueño Vendedor" or "Aportante" entity type
      if (!projectId) {
        const { data, error } = await supabase
          .from('entidades_relacionadas')
          .select('id_tipo_entidad')
          .eq('id_persona', validPersonId)
          .in('id_tipo_entidad', [4, 15, 6]) // "Dueño Vendedor", "Aportante" or "Administradora"
          .eq('activo', true)
          .limit(1)
          .single();
        
        if (error) return null;
        return data;
      }
      
      const { data, error } = await supabase
        .from('entidades_relacionadas')
        .select('id_tipo_entidad')
        .eq('id_persona', validPersonId)
        .eq('id_proyecto', projectId)
        .eq('activo', true)
        .single();
      
      if (error) return null;
      return data;
    },
    enabled: showStpCheckbox && !!validPersonId
  });

  // Check if this person already has an STP account
  const { data: existingStpAccount } = useQuery({
    queryKey: ['existing_stp_account', validPersonId],
    queryFn: async () => {
      if (!validPersonId) return null;
      
      const { data, error } = await supabase
        .from('cuentas_bancarias')
        .select('id, id_persona')
        .eq('id_persona', validPersonId)
        .eq('es_cuenta_fisica_para_stp', true)
        .eq('activo', true)
        .single();
      
      if (error) return null;
      return data;
    },
    enabled: showStpCheckbox && !!validPersonId
  });

  const shouldShowStpCheckbox = showStpCheckbox && 
    entityData && 
    (entityData.id_tipo_entidad === 4 || entityData.id_tipo_entidad === 15 || entityData.id_tipo_entidad === 6); // "Dueño Vendedor", "Aportante" or "Administradora"

  const addMutation = useMutation({
    mutationFn: async (accountData: typeof newAccount) => {
      if (!validPersonId) {
        throw new Error('No se puede agregar cuenta: ID de persona no disponible');
      }
      
      // If trying to set STP account, check if this person already has one
      if (accountData.es_cuenta_fisica_para_stp && existingStpAccount) {
        throw new Error('Esta entidad ya tiene una cuenta STP');
      }

      const insertData = {
        ...accountData,
        id_banco: parseInt(accountData.id_banco),
        id_persona: validPersonId,
        url_evidencia: accountData.url_evidencia || null,
        cuenta_clabe: accountData.cuenta_clabe || null,
        cuenta_swift: accountData.cuenta_swift || null
      };
      
      const { data, error } = await supabase
        .from('cuentas_bancarias')
        .insert([insertData])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await refetchBankAccounts();
      queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
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
    onError: (error: any) => {
      toast({ 
        title: "Error al agregar cuenta bancaria", 
        description: error.message || 'Error desconocido',
        variant: "destructive" 
      });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (accountData: any) => {
      const { data, error } = await supabase
        .from('cuentas_bancarias')
        .update({
          id_banco: parseInt(accountData.id_banco),
          numero_cuenta: accountData.numero_cuenta,
          cuenta_clabe: accountData.cuenta_clabe || null,
          cuenta_swift: accountData.cuenta_swift || null,
          url_evidencia: accountData.url_evidencia || null,
          es_cuenta_fisica_para_stp: accountData.es_cuenta_fisica_para_stp
        })
        .eq('id', accountData.id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await refetchBankAccounts();
      queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
      setEditingAccount(null);
      toast({ title: "Cuenta bancaria actualizada exitosamente" });
    },
    onError: (error: any) => {
      toast({ title: "Error al actualizar cuenta bancaria", description: error.message, variant: "destructive" });
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
    onSuccess: async () => {
      await refetchBankAccounts();
      queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
      toast({ title: "Cuenta bancaria eliminada exitosamente" });
    },
    onError: (error: any) => {
      toast({ title: "Error al eliminar cuenta bancaria", description: error.message, variant: "destructive" });
    }
  });

  const handleSubmit = () => {
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

    onSaveAccountClick?.();
    addMutation.mutate(newAccount);
  };

  const handleEditSubmit = () => {
    if (!editingAccount.id_banco || !editingAccount.numero_cuenta) {
      toast({ title: "Por favor completa los campos requeridos", variant: "destructive" });
      return;
    }

    // Validate account number length based on STP checkbox
    const accountLength = editingAccount.numero_cuenta.length;
    if (editingAccount.es_cuenta_fisica_para_stp) {
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

    // If trying to set STP account, check if this person already has one (excluding current account)
    if (editingAccount.es_cuenta_fisica_para_stp && existingStpAccount && existingStpAccount.id !== editingAccount.id) {
      toast({ title: "Esta entidad ya tiene una cuenta STP", variant: "destructive" });
      return;
    }

    updateMutation.mutate(editingAccount);
  };

  const handleEdit = (account: any) => {
    setEditingAccount({
      ...account,
      id_banco: account.id_banco?.toString() || "",
      cuenta_clabe: account.cuenta_clabe || "",
      cuenta_swift: account.cuenta_swift || "",
      url_evidencia: account.url_evidencia || ""
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Cuentas Bancarias</h3>
        <Button
          onClick={() => { setIsAdding(true); onAddAccountClick?.(); }}
          disabled={isAdding || !!editingAccount}
        >
          <Plus className="w-4 h-4 mr-2" />
          Agregar Cuenta
        </Button>
      </div>

      {editingAccount && (
        <Card>
          <CardHeader>
            <CardTitle>Editar Cuenta Bancaria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit_id_banco">Banco *</Label>
                <Select 
                  value={editingAccount.id_banco} 
                  onValueChange={(value) => setEditingAccount(prev => ({ ...prev, id_banco: value }))}
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
                <Label htmlFor="edit_numero_cuenta">Número de Cuenta *</Label>
                <Input
                  id="edit_numero_cuenta"
                  value={editingAccount.numero_cuenta}
                  onChange={(e) => setEditingAccount(prev => ({ ...prev, numero_cuenta: e.target.value }))}
                  placeholder={editingAccount.es_cuenta_fisica_para_stp ? "18 dígitos exactos" : "Entre 8 y 34 caracteres"}
                  maxLength={18}
                />
              </div>

              <div>
                <Label htmlFor="edit_cuenta_clabe">CLABE</Label>
                <Input
                  id="edit_cuenta_clabe"
                  value={editingAccount.cuenta_clabe}
                  onChange={(e) => setEditingAccount(prev => ({ ...prev, cuenta_clabe: e.target.value }))}
                  placeholder="18 dígitos (opcional)"
                  maxLength={18}
                />
              </div>

              <div>
                <Label htmlFor="edit_cuenta_swift">Código SWIFT</Label>
                <Input
                  id="edit_cuenta_swift"
                  value={editingAccount.cuenta_swift}
                  onChange={(e) => setEditingAccount(prev => ({ ...prev, cuenta_swift: e.target.value }))}
                  placeholder="8 u 11 caracteres (opcional)"
                />
              </div>

              <ImageUploadField
                label="Evidencia"
                value={editingAccount.url_evidencia}
                onChange={(url) => setEditingAccount(prev => ({ ...prev, url_evidencia: url }))}
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
              />

              {shouldShowStpCheckbox && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit_es_cuenta_fisica_para_stp"
                    checked={editingAccount.es_cuenta_fisica_para_stp}
                    onCheckedChange={(checked) => 
                      setEditingAccount(prev => ({ ...prev, es_cuenta_fisica_para_stp: checked as boolean }))
                    }
                    disabled={existingStpAccount && existingStpAccount.id !== editingAccount.id}
                  />
                  <Label htmlFor="edit_es_cuenta_fisica_para_stp">
                    Es cuenta física para STP
                    {existingStpAccount && existingStpAccount.id !== editingAccount.id && (
                      <span className="text-xs text-muted-foreground block">
                        (Esta entidad ya tiene una cuenta STP)
                      </span>
                    )}
                  </Label>
                </div>
              )}

              <div className="flex gap-2">
                <Button 
                  type="button" 
                  disabled={updateMutation.isPending}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleEditSubmit();
                  }}
                >
                  {updateMutation.isPending ? "Actualizando..." : "Actualizar"}
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setEditingAccount(null)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isAdding && (
        <Card>
          <CardHeader>
            <CardTitle>Nueva Cuenta Bancaria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="id_banco">Banco *</Label>
                <Select 
                  value={newAccount.id_banco} 
                  onValueChange={(value) => setNewAccount(prev => ({ ...prev, id_banco: value }))}
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
                    disabled={!!existingStpAccount}
                  />
                  <Label htmlFor="es_cuenta_fisica_para_stp">
                    Es cuenta física para STP
                    {existingStpAccount && (
                      <span className="text-xs text-muted-foreground block">
                        (Esta entidad ya tiene una cuenta STP)
                      </span>
                    )}
                  </Label>
                </div>
              )}

              <div className="flex gap-2">
                <Button 
                  type="button" 
                  disabled={addMutation.isPending}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSubmit();
                  }}
                >
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
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {!isAdding && !editingAccount && bankAccounts.map((account) => (
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
                    <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                      Cuenta física para STP
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleEdit(account)}
                    disabled={!!editingAccount || isAdding}
                    title="Editar cuenta"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => deleteMutation.mutate(account.id)}
                    disabled={deleteMutation.isPending || !!editingAccount || isAdding}
                    title="Eliminar cuenta"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {bankAccounts.length === 0 && !isAdding && !editingAccount && (
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