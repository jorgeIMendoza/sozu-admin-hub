

## Plan: Campo precio_m2_actual editable solo cuando todas las propiedades estan vendidas o mas

### Problema
El campo "Precio por m2 actual" esta siempre deshabilitado en el formulario de edicion de proyecto. Se requiere que sea editable, pero solo cuando **todas** las propiedades del proyecto tengan `id_estatus_disponibilidad > 3` (es decir, ya pasaron de Inventario/Disponible/Apartando).

### Cambios

**Archivo: `src/components/admin/EditProjectDialog.tsx`**

1. **Agregar query para verificar si hay propiedades con estatus <= 3**

   Dentro del componente, agregar una consulta que cuente propiedades del proyecto con `id_estatus_disponibilidad <= 3`:

   ```typescript
   const { data: propiedadesPendientes } = useQuery({
     queryKey: ["propiedades-pendientes-proyecto", project.id],
     queryFn: async () => {
       const { count, error } = await supabase
         .from("propiedades")
         .select("id", { count: "exact", head: true })
         .eq("id_proyecto", project.id)
         .lte("id_estatus_disponibilidad", 3)
         .eq("activo", true);
       if (error) throw error;
       return count ?? 0;
     },
     enabled: open,
   });

   const todasVendidas = propiedadesPendientes === 0;
   ```

   Nota: `id_proyecto` se obtendra a traves del edificio. Se verificara la ruta exacta de relacion (propiedades -> edificios_modelos -> edificios -> proyecto) y se usara un RPC o join si es necesario. Si no hay campo directo, se hara la consulta encadenada.

2. **Hacer el campo condicionalmente editable** (lineas 543-557)

   Cambiar el input de siempre `disabled` a condicionalmente habilitado:

   ```tsx
   <FormItem>
     <FormLabel>
       Precio por m2 actual 
       {!todasVendidas && " (se habilita cuando todas las propiedades esten vendidas)"}
     </FormLabel>
     <FormControl>
       <Input 
         type="text" 
         placeholder="0.00" 
         value={formattedValue}
         disabled={!todasVendidas}
         className={!todasVendidas ? "bg-muted" : ""}
         readOnly={!todasVendidas}
         onChange={(e) => {
           const raw = e.target.value.replace(/[^0-9.]/g, '');
           field.onChange(raw);
         }}
       />
     </FormControl>
     <FormMessage />
   </FormItem>
   ```

### Modificacion del trigger (migracion SQL)

Se creara una migracion para actualizar la funcion `actualizar_precio_m2_proyecto()` cambiando la condicion de estatus 4 (Apartado) a estatus 5 (Vendido).

### Actualizacion de Bottura

Se ejecutara el UPDATE para corregir el precio_m2_actual de Bottura a $80,939.95 basado en la propiedad con el precio/m2 mas alto ya vendida.

