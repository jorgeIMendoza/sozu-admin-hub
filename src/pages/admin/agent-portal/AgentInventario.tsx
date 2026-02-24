const AgentInventario = () => {
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-[hsl(var(--agent-text))]">Inventario</h1>
      <div className="rounded-xl bg-white p-4 border border-gray-100 shadow-sm">
        <p className="text-sm text-[hsl(var(--agent-text-secondary))]">
          Lista de proyectos disponibles (próximamente)
        </p>
      </div>
    </div>
  );
};

export default AgentInventario;
