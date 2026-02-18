

# Fix: Inventario page not loading due to missing A/B test configuration

## Problem
The inventory route (`/admin/inmobiliarias/inventario`) renders through `InventarioGlobalAB`, which depends on the `useAbTest` hook. This hook queries the `ab_tests` table for an active test on that page. Currently there are **zero records** in `ab_tests` for this page, and depending on auth timing the query can get stuck in a loading state, leaving the page blank.

## Solution (two parts)

### 1. Insert an active A/B test record in the database
Create a record in the `ab_tests` table for the inventory page so the system works as designed:

- **nombre**: "Inventario Grid vs Carrusel"
- **pagina**: "/admin/inmobiliarias/inventario"
- **activo**: true
- **variantes**: ["A", "B"]
- **porcentaje_distribucion**: {"A": 50, "B": 50}

This is a data insert operation (not a schema migration).

### 2. Make the AB wrapper resilient to missing tests
Update `InventarioGlobalAB.tsx` so that if no active test is found (or the query errors), it gracefully falls back to rendering Variant A instead of getting stuck on a loading spinner. This ensures the page always renders even without a configured test.

## Technical details

**Data insert** (`ab_tests` table):
```sql
INSERT INTO ab_tests (nombre, descripcion, pagina, activo, variantes, porcentaje_distribucion)
VALUES (
  'Inventario Grid vs Carrusel',
  'Comparar vista grid (A) contra carrusel horizontal por proyecto (B)',
  '/admin/inmobiliarias/inventario',
  true,
  '["A","B"]',
  '{"A":50,"B":50}'
);
```

**Code change** (`InventarioGlobalAB.tsx`):
- Remove the blocking `isLoading` spinner -- instead, default to rendering variant A immediately while the test assignment resolves in the background.
- This way, even if there is no test configured or the query is slow, the user always sees the inventory page.

