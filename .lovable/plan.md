

## Corrección de CLABE oferta 1791 + Validación preventiva

### 1. Corregir CLABE de oferta 1791 (UPDATE con insert tool)
Ejecutar UPDATE para corregir el valor truncado:
```sql
UPDATE ofertas 
SET clabe_stp_tmp_producto = '646180287400133056' 
WHERE id = 1791 AND clabe_stp_tmp_producto = '64618028740013305';
```

### 2. Validación preventiva en `src/utils/clabeReuseUtils.ts`
En la función `getOrCreateProductClabe`, al filtrar ofertas reutilizables, agregar validación de que la CLABE tenga exactamente 18 dígitos. Las CLABEs con longitud incorrecta se descartan del pool de reutilización, y si no quedan CLABEs válidas se genera una nueva.

Cambio específico: en el loop que construye `offersWithoutAccount`, agregar condición:
```typescript
if (count === 0 && offer.clabe_stp_tmp_producto?.length === 18) {
  offersWithoutAccount.push(...);
}
```

