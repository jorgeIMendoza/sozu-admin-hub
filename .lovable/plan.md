

# Robustecimiento de expresiones Cron en Administrar Avisos

## Problema actual
1. La funcion `describeCron` no maneja correctamente rangos en meses (ej. `1-2` deberia mostrar "enero y febrero" pero muestra "1-2" literal)
2. No hay validacion de que la expresion cron sea valida segun las reglas Unix antes de guardar
3. Para `0 9 * 1-2 4` deberia decir: **"Los jueves a las 9:00 en enero y febrero"**

## Cambios

### 1. Mejorar `describeCron` para manejar rangos y listas en todos los campos

**Meses con rangos** (`1-2` → "enero y febrero", `1-6` → "enero a junio"):
- Expandir rangos de meses para mostrar nombres completos
- Si el rango es de 2 meses contiguos, usar "y" (enero y febrero)
- Si el rango es mayor, usar "a" (enero a junio)

**Dias de semana con rangos** (ya funciona parcialmente pero mejorar):
- `1-5` → "lunes a viernes"
- `1,3,5` → "lunes, miercoles y viernes"

**Dias del mes con rangos y listas**:
- `1,15` → "los dias 1 y 15 del mes"
- `1-5` → "los dias 1 al 5 del mes"

**Steps en todos los campos**:
- `*/2` en hora → "cada 2 horas"
- `*/5` en minuto → "cada 5 minutos"

### 2. Agregar funcion de validacion `validateCron`

Validar cada campo segun las reglas Unix estandar:
- **Minutos**: 0-59
- **Hora**: 0-23
- **Dia del mes**: 1-31
- **Mes**: 1-12
- **Dia de semana**: 0-7 (0 y 7 = domingo)
- Soportar: `*`, listas (`,`), rangos (`-`), steps (`*/n`, `n-m/s`)
- Rechazar valores fuera de rango, caracteres invalidos, rangos invertidos

### 3. Integrar validacion en la UI

- Mostrar mensaje de error en rojo debajo del input si la expresion es invalida
- Bloquear el boton "Guardar" / "Crear Aviso" si la expresion cron es invalida
- Solo mostrar la descripcion en lenguaje natural si la expresion es valida

### 4. Validar al guardar (handleSave)

- Agregar llamada a `validateCron` antes de guardar
- Mostrar toast de error si la expresion no es valida

---

## Detalle tecnico

### Archivo: `src/pages/admin/comunicacion/AdministrarAvisos.tsx`

**Nueva funcion `validateCron`**:
```typescript
function validateCron(expr: string): { valid: boolean; error?: string } {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return { valid: false, error: 'Debe tener 5 campos: minuto hora dia-mes mes dia-semana' };

  const ranges = [
    { name: 'Minuto', min: 0, max: 59 },
    { name: 'Hora', min: 0, max: 23 },
    { name: 'Dia del mes', min: 1, max: 31 },
    { name: 'Mes', min: 1, max: 12 },
    { name: 'Dia de semana', min: 0, max: 7 },
  ];

  for (let i = 0; i < 5; i++) {
    const validation = validateField(parts[i], ranges[i]);
    if (!validation.valid) return validation;
  }
  return { valid: true };
}
```

**Mejora en `describeCron`** - manejar rangos en meses:
```typescript
if (mon !== '*') {
  const months = mon.split(',').map(m => {
    if (m.includes('-')) {
      const [a, b] = m.split('-');
      return `${MESES[a] || a} a ${MESES[b] || b}`;
    }
    return MESES[m] || m;
  });
  when += (when ? ' en ' : 'en ') + months.join(', ');
}
```

**Estado de validacion en UI**:
```typescript
const [cronError, setCronError] = useState<string>("");

// En el onChange del input
onChange={e => {
  const val = e.target.value;
  setCronExpression(val);
  if (val.trim()) {
    const result = validateCron(val);
    setCronError(result.valid ? "" : result.error || "");
  } else {
    setCronError("");
  }
}}

// Debajo del input, mostrar error o descripcion
{cronError && <p className="text-sm text-destructive">{cronError}</p>}
{!cronError && cronExpression && <p className="text-sm font-medium text-primary">{describeCron(cronExpression)}</p>}
```

**En handleSave** - agregar validacion:
```typescript
if (tipoEnvio === 'automatico') {
  if (!cronExpression) { /* error existente */ return; }
  const cronValidation = validateCron(cronExpression);
  if (!cronValidation.valid) {
    toast({ title: "Error", description: cronValidation.error, variant: "destructive" });
    return;
  }
}
```

## Ejemplos de resultado

| Expresion | Descripcion |
|---|---|
| `0 9 * * 4` | Los jueves a las 9:00 |
| `0 9 * 1-2 4` | Los jueves a las 9:00 en enero a febrero |
| `0 9 * 1,6 *` | Todos los dias a las 9:00 en enero, junio |
| `0 9 1 * *` | El dia 1 del mes a las 9:00 |
| `*/5 * * * *` | Cada 5 minutos |
| `0 9 * * 1-5` | Los lunes a viernes a las 9:00 |
| `0 9 * * 1,3,5` | Los lunes, miercoles, viernes a las 9:00 |
| `0 25 * * *` | Error: Hora debe estar entre 0 y 23 |
| `0 9 32 * *` | Error: Dia del mes debe estar entre 1 y 31 |

