
## Block "Cliente" and "Directores" Roles from System Access

### What will change
Users with the roles **Cliente** (ID 23) and **Directores** (ID 19) will be blocked from accessing the admin system entirely. When they log in, they will see a clear "access denied" message instead of the admin interface.

### How it works
The check will be added to the `ProtectedRoute` component, which wraps all admin routes. After the user's profile loads, if their role is "Cliente" or "Directores", they will see a full-screen message explaining they don't have access, along with a button to sign out.

This is the same component that already blocks inactive users, so the pattern is consistent.

### Technical Details

**File: `src/components/auth/ProtectedRoute.tsx`**

Add a check after the inactive-user block (around line 36-47):

```typescript
// Blocked roles: Cliente and Directores cannot access the admin system
const BLOCKED_ROLE_NAMES = ['Cliente', 'Directores'];

if (profile && BLOCKED_ROLE_NAMES.includes(profile.rol_nombre)) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center p-8 bg-card rounded-lg shadow-lg max-w-md space-y-4">
        <ShieldAlert className="h-16 w-16 text-destructive mx-auto" />
        <h1 className="text-2xl font-bold text-destructive">
          Acceso No Autorizado
        </h1>
        <p className="text-muted-foreground">
          Tu tipo de usuario no tiene acceso a este sistema.
          Contacta al administrador si crees que esto es un error.
        </p>
        <Button variant="destructive" onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Cerrar Sesion
        </Button>
      </div>
    </div>
  );
}
```

A sign-out handler will be added using `supabase.auth.signOut()` to allow the user to log out cleanly from this screen.

No database changes are required.
