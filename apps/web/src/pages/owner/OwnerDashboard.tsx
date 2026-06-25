export function OwnerDashboard() {
  const stats = [
    { label: "Today's Sales", value: '—', sub: 'Phase 3' },
    { label: 'Pending Orders', value: '—', sub: 'Phase 4' },
    { label: 'Low Stock Items', value: '—', sub: 'Phase 2' },
    { label: 'Gold Rate (22K)', value: '—', sub: 'Phase 2' },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Welcome back, Owner</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(({ label, value, sub }) => (
          <div key={label} className="bg-card border rounded-xl p-5 shadow-sm">
            <p className="text-sm text-muted-foreground font-medium">{label}</p>
            <p className="text-3xl font-bold mt-2 text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">Available in {sub}</p>
          </div>
        ))}
      </div>
      <div className="bg-card border rounded-xl p-5 shadow-sm">
        <h3 className="font-semibold mb-3">Phase 1 — Foundation ✓</h3>
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <li>✅ Monorepo scaffold (NestJS + React + shared-types)</li>
          <li>✅ PostgreSQL schema with all entities</li>
          <li>✅ JWT authentication with refresh tokens</li>
          <li>✅ Role-based access control</li>
          <li>✅ Global validation, error handling, logging</li>
          <li>✅ Frontend layouts per role</li>
          <li>🔜 Phase 2: Inventory & live rate sync</li>
        </ul>
      </div>
    </div>
  );
}
