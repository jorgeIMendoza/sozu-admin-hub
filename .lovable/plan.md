

# Correccion: Auto-captura se dispara sin documento presente

## Problema

La deteccion de "documento presente" es demasiado permisiva. El umbral actual (`MIN_CONTENT_THRESHOLD = 0.15`) se cumple facilmente con cualquier escena que tenga algo de contraste (escritorio, pared, textura), causando que la captura automatica se dispare sin que haya un documento real en el marco.

## Solucion

### 1. Agregar retardo inicial antes de activar auto-captura

Cuando se abre la camara, esperar **3 segundos** antes de comenzar a evaluar estabilidad. Esto da tiempo al usuario de posicionar el documento. Se mostrara un texto "Posiciona tu documento..." durante este periodo.

- Nuevo ref `initialDelayRef` que se activa al inicio
- El hook `useStabilityDetection` recibira un parametro `initialDelayMs` (default 3000)
- Durante el delay, no se evalua estabilidad ni se muestra progreso

### 2. Aumentar umbrales de deteccion de contenido

En `useStabilityDetection` dentro de `DocumentVerification.tsx`:

| Parametro | Actual | Nuevo | Razon |
|---|---|---|---|
| `MIN_CONTENT_THRESHOLD` | 0.15 (15%) | 0.30 (30%) | Un documento real tiene bordes definidos, texto, fotos - genera mucho mas contraste que un fondo |
| `STABILITY_DURATION` | 1000ms | 1500ms | Mas tiempo quieto = mas confianza de que es intencional |
| Contraste minimo para edge | 30 | 40 | Filtrar ruido de camara y texturas suaves |

### 3. Agregar deteccion de rectangulo (distribucion de bordes)

Ademas del ratio de bordes, verificar que los bordes estan distribuidos en multiples zonas del frame (no concentrados en una esquina). Dividir el frame en 4 cuadrantes y requerir que al menos 3 tengan actividad de bordes. Un documento ocupa la mayor parte del marco, asi que genera bordes en todas las zonas.

### 4. Indicador visual de "documento detectado"

Antes de iniciar el conteo de estabilidad, mostrar un indicador verde "Documento detectado" para que el usuario sepa que el sistema reconoce algo en el marco. Si no se detecta, mostrar "Posiciona tu documento en el marco".

---

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/components/admin/DocumentVerification.tsx` | Hook `useStabilityDetection`: retardo inicial 3s, umbral 30%, contraste 40, deteccion multi-cuadrante, nuevo estado `documentDetected`. Componentes `DocCameraOverlay` y `SelfieCameraOverlay`: mostrar indicador de deteccion |

## Detalles tecnicos

### Hook `useStabilityDetection` - cambios clave

```text
Nuevos parametros:
- initialDelayMs: number (default 3000)

Nuevo estado retornado:
- documentDetected: boolean

Logica de cuadrantes:
- Dividir frame en 4 cuadrantes (top-left, top-right, bottom-left, bottom-right)
- Contar bordes por cuadrante
- Requerir que al menos 3 de 4 cuadrantes tengan > 5% de bordes
- Esto evita falsos positivos por una sola zona con contraste
```

### DocCameraOverlay - indicador visual

Cuando `documentDetected = false`:
- Texto amarillo: "Coloca tu documento dentro del marco"
- Borde del marco en amarillo

Cuando `documentDetected = true`:
- Texto verde: "Documento detectado, manten quieto..."
- Borde del marco en verde
- Se inicia conteo de estabilidad

