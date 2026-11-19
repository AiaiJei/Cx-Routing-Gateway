import type { Protocol } from "../domain/types";

export function ProtocolBadge({ protocol, children }: { protocol: Protocol; children?: React.ReactNode }) {
  return <span className={`protocol-badge protocol-${protocol.toLowerCase()}`}>{children ?? protocol}</span>;
}

export function ProtocolFlow({ value }: { value: string }) {
  const steps = value.split(" → ");
  const protocols = new Set<Protocol>(["Res", "Mes", "Chat"]);
  if (steps.length < 2 || steps.some((step) => !protocols.has(step as Protocol))) return <>{value}</>;

  return (
    <span className="protocol-flow" aria-label={value}>
      {steps.map((step, index) => (
        <span className="protocol-flow-step" key={`${step}-${index}`}>
          {index > 0 && <span className="protocol-flow-arrow" aria-hidden="true">→</span>}
          <ProtocolBadge protocol={step as Protocol} />
        </span>
      ))}
    </span>
  );
}
