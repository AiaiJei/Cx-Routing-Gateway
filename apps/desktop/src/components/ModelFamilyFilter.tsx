import { MODEL_FAMILIES, type ModelFamily, type ModelFamilySelection } from "../domain/model-family";

export function ModelFamilyFilter({ ariaLabel, value, families, onChange }: {
  ariaLabel: string;
  value: ModelFamilySelection;
  families: readonly ModelFamily[];
  onChange: (family: ModelFamilySelection) => void;
}) {
  const counts = new Map<ModelFamily, number>();
  for (const family of families) counts.set(family, (counts.get(family) ?? 0) + 1);
  const options = [
    { id: "all" as const, label: "全部", count: families.length },
    ...MODEL_FAMILIES.map(family => ({ ...family, count: counts.get(family.id) ?? 0 })),
  ];
  return <div className="model-family-filter" role="group" aria-label={ariaLabel}>
    {options.map(option => <button type="button" className="segment-button model-family-button" key={option.id}
      aria-pressed={value === option.id} aria-label={`${option.label} ${option.count}`} onClick={() => onChange(option.id)}>
      <span>{option.label}</span><span className="model-family-count">{option.count}</span>
    </button>)}
  </div>;
}
