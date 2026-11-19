import { ProtocolBadge } from "./ProtocolBadge";
import type { Protocol } from "../domain/types";

const steps: { title: string; protocol: Protocol; label: string; detail: string }[] = [
  { title: "客户端请求", protocol: "Res", label: "入站协议", detail: "请求携带客户端使用的协议" },
  { title: "目标上游", protocol: "Chat", label: "出站协议", detail: "按路由配置向上游发送" },
  { title: "返回客户端", protocol: "Res", label: "响应协议", detail: "与本次请求的入站协议一致" },
];

export function ProtocolExplanation() {
  return <section className="protocol-explanation" aria-labelledby="protocol-explanation-title">
    <h2 id="protocol-explanation-title" className="section-title">协议转换示例</h2>
    <p className="helper-text">入站由客户端请求决定，出站按路由配置，响应恢复为原入站协议。</p>
    <span className="sr-only">Res 入站 → Chat 出站 → Res 响应</span>
    <ol className="protocol-path">
      {steps.map((step, index) => <li key={step.title}>
        <div className="protocol-path-step">
          <span className="field-label">{step.title}</span>
          <div><ProtocolBadge protocol={step.protocol} /><strong>{step.label}</strong></div>
          <p className="helper-text">{step.detail}</p>
        </div>
        {index < steps.length - 1 && <div className="protocol-path-connector" aria-hidden="true">
          <span>{index === 0 ? "请求转换" : "响应转换"}</span>
          <svg viewBox="0 0 100 20" fill="none"><path d="M1 10h96m-5-5 5 5-5 5" /></svg>
        </div>}
      </li>)}
    </ol>
  </section>;
}
