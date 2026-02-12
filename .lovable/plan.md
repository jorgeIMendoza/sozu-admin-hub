
# Correccion de zona horaria en el timestamp de version

## Problema
El timestamp del build (`v2.4.0-260212.0049`) usa la hora del **servidor de Lovable (UTC)**, no la hora de Mexico (UTC-6). Cuando son las 23:30 del 11 de febrero en Mexico, en UTC ya es el 12 de febrero, por eso aparece un dia adelantado.

## Solucion
Forzar el calculo del timestamp a la zona horaria de Mexico (UTC-6) en `vite.config.ts`, lineas 10-17.

### Cambio en `vite.config.ts`

Reemplazar el calculo actual que usa `new Date()` directo (que toma la hora UTC del servidor) por uno que ajuste a UTC-6:

```text
Antes:
  const now = new Date();
  const year = String(now.getFullYear()).slice(2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');

Despues:
  const now = new Date();
  // Forzar zona horaria Mexico (UTC-6)
  const mexicoTime = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const year = String(mexicoTime.getUTCFullYear()).slice(2);
  const month = String(mexicoTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(mexicoTime.getUTCDate()).padStart(2, '0');
  const hours = String(mexicoTime.getUTCHours()).padStart(2, '0');
  const minutes = String(mexicoTime.getUTCMinutes()).padStart(2, '0');
```

Se usan metodos `getUTC*` sobre la fecha ya ajustada para evitar que el runtime del servidor aplique su propia zona horaria.

## Impacto
- Solo afecta el string de version mostrado en el login y la pagina de version
- No afecta logica de negocio ni comparacion de versiones
- El proximo build generara un timestamp correcto en hora Mexico
