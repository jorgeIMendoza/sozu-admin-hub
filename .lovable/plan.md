

# Plan: Tres Mejoras de UI

## 1. Mostrar Version en Pantalla de Login

Agregar la version actual de la aplicacion en la pantalla de login, debajo del formulario.

### Archivo: `src/pages/auth/Login.tsx`

**Cambios:**
- Importar `APP_VERSION` desde `@/lib/config`
- Agregar un texto pequeno debajo del boton de login mostrando la version

```typescript
// Agregar import
import { APP_VERSION } from '@/lib/config';

// Al final del Card, despues del boton:
<p className="text-xs text-muted-foreground text-center mt-4">
  {APP_VERSION}
</p>
```

---

## 2. Modal de Edicion de Comprador al hacer clic en RFC

En la vista DetalleCuentaCobranza, hacer el Badge del RFC clickeable para abrir un modal con la informacion del comprador (usando PersonForm).

### Archivo: `src/pages/admin/DetalleCuentaCobranza.tsx`

**Cambios:**

1. **Agregar estados para el modal del comprador:**
```typescript
const [editingComprador, setEditingComprador] = useState<any>(null);
const [isCompradorDialogOpen, setIsCompradorDialogOpen] = useState(false);
```

2. **Agregar import de PersonForm:**
```typescript
import { PersonForm } from "@/components/admin/PersonForm";
```

3. **Agregar mutation para actualizar comprador:**
```typescript
const updateCompradorMutation = useMutation({
  mutationFn: async (data: any) => {
    const { error } = await supabase
      .from('personas')
      .update({
        nombre_legal: data.nombre_legal,
        email: data.email,
        telefono: data.telefono,
        clave_pais_telefono: data.clave_pais_telefono,
        rfc: data.rfc,
        curp: data.curp,
        // ... otros campos
      })
      .eq('id', data.id);
    if (error) throw error;
  },
  onSuccess: () => {
    toast({ title: "Comprador actualizado" });
    setIsCompradorDialogOpen(false);
    setEditingComprador(null);
    queryClient.invalidateQueries({ queryKey: ["cuenta_detalle", cuentaId] });
  },
  onError: (error) => {
    toast({ title: "Error", description: error.message, variant: "destructive" });
  }
});
```

4. **Funcion para manejar click en RFC:**
```typescript
const handleRfcClick = async (idPersona: number) => {
  const { data, error } = await supabase
    .from('personas')
    .select('*')
    .eq('id', idPersona)
    .single();
  
  if (!error && data) {
    setEditingComprador(data);
    setIsCompradorDialogOpen(true);
  }
};
```

5. **Modificar el Badge del RFC para hacerlo clickeable (lineas ~3448-3450):**
```typescript
// Antes:
{comprador.rfc && (
  <Badge variant="outline" className="text-xs">{comprador.rfc}</Badge>
)}

// Despues:
{comprador.rfc && comprador.id_persona && (
  <Badge 
    variant="outline" 
    className="text-xs cursor-pointer hover:bg-primary/10 text-primary"
    onClick={() => handleRfcClick(comprador.id_persona!)}
  >
    {comprador.rfc}
  </Badge>
)}
```

6. **Agregar el Dialog al final del componente:**
```typescript
<Dialog open={isCompradorDialogOpen} onOpenChange={setIsCompradorDialogOpen}>
  <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
    <DialogHeader>
      <DialogTitle>Editar Comprador</DialogTitle>
    </DialogHeader>
    {editingComprador && (
      <PersonForm
        initialData={{
          ...editingComprador,
          representativeId: editingComprador?.id_entidad_relacionada_rep_leg
        }}
        onSubmit={(data) => updateCompradorMutation.mutate({ ...data, id: editingComprador.id })}
        isLoading={updateCompradorMutation.isPending}
        onCancel={() => {
          setIsCompradorDialogOpen(false);
          setEditingComprador(null);
        }}
        entityType="comprador"
      />
    )}
  </DialogContent>
</Dialog>
```

---

## 3. Mostrar Usuarios a Crear al Aprobar Draft de Inmobiliaria

Agregar un dialogo de confirmacion que muestre los usuarios que se van a crear antes de aprobar el draft.

### Archivo: `src/pages/admin/Inmobiliarias.tsx`

**Cambios:**

1. **Ya existe un tipo `UserToCreate` (linea 22-27)** - lo usaremos.

2. **Agregar estados para el dialogo de confirmacion:**
```typescript
const [approveConfirmDialog, setApproveConfirmDialog] = useState<{
  isOpen: boolean;
  inmobiliaria: Inmobiliaria | null;
  usersToCreate: UserToCreate[];
}>({ isOpen: false, inmobiliaria: null, usersToCreate: [] });
```

3. **Crear funcion para preparar la aprobacion (antes de ejecutar `approveMutation`):**
```typescript
const handlePrepareApproval = async (inmobiliaria: Inmobiliaria) => {
  const usersToCreate: UserToCreate[] = [];
  
  // Usuario de la inmobiliaria
  usersToCreate.push({
    email: inmobiliaria.email,
    nombre: inmobiliaria.nombre_legal,
    rol: 'Inmobiliaria',
    tipo: 'inmobiliaria'
  });
  
  // Rep Legal
  if (inmobiliaria.id_entidad_relacionada_rep_leg) {
    const { data } = await supabase
      .from('entidades_relacionadas')
      .select('personas!entidades_relacionadas_id_persona_fkey(nombre_legal, email)')
      .eq('id', inmobiliaria.id_entidad_relacionada_rep_leg)
      .single();
    
    if (data?.personas) {
      const persona = data.personas as any;
      // Verificar si ya existe usuario
      const { data: existingUser } = await supabase
        .from('usuarios')
        .select('email')
        .eq('email', persona.email)
        .maybeSingle();
      
      if (!existingUser && persona.email) {
        usersToCreate.push({
          email: persona.email,
          nombre: persona.nombre_legal,
          rol: 'Agente Inmobiliario',
          tipo: 'rep_legal'
        });
      }
    }
  }
  
  // Rep Comercial (similar)
  if (inmobiliaria.id_entidad_relacionada_rep_com) {
    // ... logica similar
  }
  
  setApproveConfirmDialog({
    isOpen: true,
    inmobiliaria,
    usersToCreate
  });
};
```

4. **Modificar el boton de aprobar para llamar a `handlePrepareApproval`:**
```typescript
// En la tabla, cambiar onClick del boton Aprobar:
<Button onClick={() => handlePrepareApproval(inmobiliaria)}>
  <CheckCircle className="h-4 w-4 mr-1" />
  Aprobar
</Button>
```

5. **Agregar el dialogo de confirmacion:**
```typescript
<Dialog 
  open={approveConfirmDialog.isOpen} 
  onOpenChange={(open) => !open && setApproveConfirmDialog({ isOpen: false, inmobiliaria: null, usersToCreate: [] })}
>
  <DialogContent className="max-w-md">
    <DialogHeader>
      <DialogTitle>Confirmar Aprobacion</DialogTitle>
    </DialogHeader>
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Se crearan los siguientes usuarios:
      </p>
      <div className="space-y-2">
        {approveConfirmDialog.usersToCreate.map((user, idx) => (
          <div key={idx} className="flex items-center justify-between p-2 border rounded">
            <div>
              <p className="font-medium text-sm">{user.nombre}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
            <Badge variant="outline">{user.rol}</Badge>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Password temporal: <code className="bg-muted px-1 rounded">Temporal123!</code>
      </p>
    </div>
    <div className="flex justify-end gap-2 mt-4">
      <Button variant="outline" onClick={() => setApproveConfirmDialog({ isOpen: false, inmobiliaria: null, usersToCreate: [] })}>
        Cancelar
      </Button>
      <Button 
        onClick={() => {
          if (approveConfirmDialog.inmobiliaria) {
            approveMutation.mutate(approveConfirmDialog.inmobiliaria);
            setApproveConfirmDialog({ isOpen: false, inmobiliaria: null, usersToCreate: [] });
          }
        }}
        disabled={approveMutation.isPending}
      >
        Confirmar Aprobacion
      </Button>
    </div>
  </DialogContent>
</Dialog>
```

---

## Resumen de Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/auth/Login.tsx` | Agregar version de la app |
| `src/pages/admin/DetalleCuentaCobranza.tsx` | RFC clickeable abre modal de edicion |
| `src/pages/admin/Inmobiliarias.tsx` | Dialogo de confirmacion con usuarios a crear |

