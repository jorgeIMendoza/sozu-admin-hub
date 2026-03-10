import { createContext, useContext, useState, ReactNode } from "react";

interface ClienteImpersonationContextType {
  impersonatedClienteEmail: string | null;
  impersonatedClientePersonaId: number | null;
  impersonatedClienteName: string | null;
  setImpersonatedCliente: (email: string | null, personaId: number | null, name: string | null) => void;
  clearImpersonation: () => void;
  isImpersonating: boolean;
}

const ClienteImpersonationContext = createContext<ClienteImpersonationContextType>({
  impersonatedClienteEmail: null,
  impersonatedClientePersonaId: null,
  impersonatedClienteName: null,
  setImpersonatedCliente: () => {},
  clearImpersonation: () => {},
  isImpersonating: false,
});

export function ClienteImpersonationProvider({ children }: { children: ReactNode }) {
  const [clienteEmail, setClienteEmail] = useState<string | null>(null);
  const [clientePersonaId, setClientePersonaId] = useState<number | null>(null);
  const [clienteName, setClienteName] = useState<string | null>(null);

  const setImpersonatedCliente = (email: string | null, personaId: number | null, name: string | null) => {
    setClienteEmail(email);
    setClientePersonaId(personaId);
    setClienteName(name);
  };

  const clearImpersonation = () => {
    setClienteEmail(null);
    setClientePersonaId(null);
    setClienteName(null);
  };

  return (
    <ClienteImpersonationContext.Provider
      value={{
        impersonatedClienteEmail: clienteEmail,
        impersonatedClientePersonaId: clientePersonaId,
        impersonatedClienteName: clienteName,
        setImpersonatedCliente,
        clearImpersonation,
        isImpersonating: !!clienteEmail,
      }}
    >
      {children}
    </ClienteImpersonationContext.Provider>
  );
}

export function useClienteImpersonation() {
  return useContext(ClienteImpersonationContext);
}
