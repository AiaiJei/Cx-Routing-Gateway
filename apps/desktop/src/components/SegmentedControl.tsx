export function SegmentedControl({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="segmented-control" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          className="segment-button"
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
