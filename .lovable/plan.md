

# Plan: Corregir Dashboard Ejecutivo - Colores, Datos y Embudo

## Problemas identificados

1. **Colores negros en iconos**: Los iconos de KPI cards usan `bg-primary/10 text-primary` pero visualmente se ven negros. Necesito usar colores explícitos verdes SOZU (`#57AE75`) y colores específicos por card (naranja para "Por cobrar", etc.)

2. **Montos en cero**: Los KPIs financieros (Ingresos cobrados, Por cobrar, Estimados) calculan sobre `comisionistas.monto_comision` (comisiones de agentes), no sobre los pagos reales de las cuentas de cobranza. Debo corregir la lógica:
   - **Ingresos cobrados**: Suma de `pagos.monto` donde `aplicado = true` en cuentas vinculadas a propiedades de ofertas de agentes
   - **Por cobrar**: `precio_lista - pagos aplicados` de propiedades apartadas/vendidas
   - **Estimados**: `precio_lista` de propiedades apartadas (estatus 4)

3. **Embudo de conversión**: Actualmente son barras horizontales con labels a la izquierda. El diseño de referencia muestra un embudo SVG tipo trapecio invertido con degradado verde, números centrados en cada nivel, y labels a la derecha. Incluye header "EMBUDO DE CONVERSIÓN COMERCIAL" / "Pipeline Global" con link "Ver pipeline".

## Cambios en `InmobDashboard.tsx`

### A. Colores de iconos KPI
Cada card tendrá un color de icono específico usando colores directos:
- Agentes: verde `#57AE75`
- Pipeline: verde oscuro
- Ofertas: verde
- Apartados: verde
- Ingresos cobrados: verde
- Por cobrar: naranja `#F59E0B`
- Estimados: gris

### B. Lógica de datos financieros
Agregar query de `cuentas_cobranza` con sus pagos para calcular ingresos reales:
- Query propiedades con `id_estatus_disponibilidad IN (4,5)` de proyectos del agente
- Query `cuentas_cobranza` vinculadas a esas propiedades
- Query `pagos` aplicados en esas cuentas
- **Ingresos cobrados** = suma pagos aplicados
- **Por cobrar** = suma (precio_lista - pagos aplicados) de propiedades activas
- **Estimados** = suma precio_lista de propiedades apartadas

### C. Embudo SVG tipo funnel real
Reemplazar `FunnelChart` con un SVG que dibuja trapecios verdes apilados con degradado (más oscuro arriba, más claro abajo), centrados horizontalmente, con:
- Cada nivel más angosto que el anterior (forma de embudo invertido)
- Número blanco bold centrado en cada trapecio
- Label a la derecha de cada nivel
- Líneas blancas separando cada nivel
- Header con "EMBUDO DE CONVERSIÓN COMERCIAL" en uppercase gris pequeño, "Pipeline Global" bold, y link "Ver pipeline >" a la derecha

### D. Card labels
Agregar el label pequeño arriba del icono (ej: "Agentes activos" en texto xs gris) tal como en la referencia.

## Archivo a modificar
- `src/pages/admin/portal-inmobiliaria/InmobDashboard.tsx`

