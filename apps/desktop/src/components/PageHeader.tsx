export function PageHeader({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function FixtureNotice({ children = "示例数据 · 非实时" }: { children?: React.ReactNode }) {
  return <p className="fixture-notice"><span className="state-dot" />{children}</p>;
}

export function SearchField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="search-field">
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="search-symbol" />
      <input type="search" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function EmptyResult({ children }: { children: React.ReactNode }) {
  return <p className="empty-result">{children}</p>;
}
