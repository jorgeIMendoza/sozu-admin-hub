## Continuar migración `proyectos.url_imagen_portada`

Quedan **328** registros pendientes con URLs `api.sozu.com`. Voy a ejecutar tandas sucesivas hasta llegar a 0.

### Ejecución
1. Lanzar loops secuenciales de 18 requests con timeout 30s cada uno al Edge Function `migrar-archivos-storage` con payload:
   ```json
   {"tabla":"proyectos","columna":"url_imagen_portada","carpeta":"proyectos","limit":50,"dry_run":false}
   ```
2. Después de cada tanda, verificar el conteo restante con SQL:
   ```sql
   SELECT COUNT(*) FROM proyectos WHERE url_imagen_portada LIKE '%api.sozu.com%';
   ```
3. Repetir hasta que el conteo sea 0.
4. Reportar total migrado y confirmar finalización de esta columna.