import { Button } from "./Button";
import { CustomSelect } from "./CustomSelect";
import { REASONING_LEVELS } from "../domain/route-selection";
import type { ModelCapabilities, ReasoningEffort, ReasoningRange } from "../domain/types";

export type CapabilitiesDraft = {
  contextWindow: string;
  maxOutputTokens: string;
  inputModalities: "" | "text" | "image";
  tools: "" | "true" | "false";
  reasoningEfforts?: ReasoningEffort[];
};

export function capabilitiesDraft(capabilities?: ModelCapabilities): CapabilitiesDraft {
  return {
    contextWindow: capabilities?.contextWindow === undefined ? "" : String(capabilities.contextWindow),
    maxOutputTokens: capabilities?.maxOutputTokens === undefined ? "" : String(capabilities.maxOutputTokens),
    inputModalities: capabilities?.inputModalities ? capabilities.inputModalities.includes("image") ? "image" : "text" : "",
    tools: capabilities?.tools === undefined ? "" : capabilities.tools ? "true" : "false",
    ...(capabilities?.reasoningEfforts === undefined ? {} : { reasoningEfforts: [...capabilities.reasoningEfforts] }),
  };
}

export function readCapabilitiesDraft(draft: CapabilitiesDraft, range?: ReasoningRange): { capabilities: ModelCapabilities | null; error?: string } {
  const capabilities: ModelCapabilities = {};
  for (const [key, label] of [["contextWindow", "上下文窗口"], ["maxOutputTokens", "最大输出"]] as const) {
    const raw = draft[key].trim();
    if (!raw) continue;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > 100000000) return { capabilities: null, error: `${label}必须是 1 至 100000000 的整数。` };
    capabilities[key] = value;
  }
  if (capabilities.contextWindow !== undefined && capabilities.maxOutputTokens !== undefined && capabilities.maxOutputTokens > capabilities.contextWindow) return { capabilities: null, error: "最大输出不能超过上下文窗口。" };
  if (draft.inputModalities) capabilities.inputModalities = draft.inputModalities === "image" ? ["text", "image"] : ["text"];
  if (draft.tools) capabilities.tools = draft.tools === "true";
  if (draft.reasoningEfforts !== undefined) {
    capabilities.reasoningEfforts = REASONING_LEVELS.filter(level => draft.reasoningEfforts!.includes(level));
    if (range && !capabilities.reasoningEfforts.some(level => REASONING_LEVELS.indexOf(level) >= REASONING_LEVELS.indexOf(range.min) && REASONING_LEVELS.indexOf(level) <= REASONING_LEVELS.indexOf(range.max))) return { capabilities: null, error: "支持的推理强度与允许区间没有交集，请调整强度或取消区间限制。" };
  }
  return { capabilities: Object.keys(capabilities).length ? capabilities : null };
}

export function RouteCapabilitiesFields({ modelId, value, onChange }: { modelId: string; value: CapabilitiesDraft; onChange: (draft: CapabilitiesDraft) => void }) {
  return <fieldset className="route-capabilities">
    <legend>模型能力</legend>
    <div className="route-capability-grid">
      <label><span>上下文窗口（tokens）</span><input type="text" inputMode="numeric" aria-label={`${modelId} 上下文窗口`} placeholder="未知" value={value.contextWindow} onChange={event => onChange({ ...value, contextWindow: event.target.value })} /></label>
      <label><span>最大输出（tokens）</span><input type="text" inputMode="numeric" aria-label={`${modelId} 最大输出`} placeholder="未知" value={value.maxOutputTokens} onChange={event => onChange({ ...value, maxOutputTokens: event.target.value })} /></label>
      <label>输入能力<CustomSelect ariaLabel={`${modelId} 输入能力`} value={value.inputModalities} options={[{ value: "", label: "默认（文本和图片）" }, { value: "text", label: "仅文本" }, { value: "image", label: "文本和图片" }]} onChange={inputModalities => onChange({ ...value, inputModalities: inputModalities as CapabilitiesDraft["inputModalities"] })} /></label>
      <label>工具调用<CustomSelect ariaLabel={`${modelId} 工具能力`} value={value.tools} options={[{ value: "", label: "按上游处理" }, { value: "true", label: "支持" }, { value: "false", label: "不支持" }]} onChange={tools => onChange({ ...value, tools: tools as CapabilitiesDraft["tools"] })} /></label>
    </div>
    <p className="helper-text">按上游处理：工具请求继续转发，由上游接受或报错；不代表已确认上游支持。明确选择不支持时，Gateway 会拒绝工具请求。</p>
    <label className="route-range-toggle"><input type="checkbox" aria-label={`指定 ${modelId} 支持的推理强度`} checked={value.reasoningEfforts !== undefined} onChange={event => onChange({ ...value, reasoningEfforts: event.target.checked ? [] : undefined })} />指定支持的推理强度<span className="helper-text">{value.reasoningEfforts === undefined ? "未知" : value.reasoningEfforts.length ? value.reasoningEfforts.join("、") : "不接受推理参数"}</span></label>
    {value.reasoningEfforts !== undefined && <div className="route-capability-efforts" role="group" aria-label={`${modelId} 支持的推理强度`}>
      {REASONING_LEVELS.map(level => <label key={level}><input type="checkbox" aria-label={`${modelId} 支持 ${level}`} checked={value.reasoningEfforts!.includes(level)} onChange={event => onChange({ ...value, reasoningEfforts: event.target.checked ? [...value.reasoningEfforts!, level] : value.reasoningEfforts!.filter(item => item !== level) })} />{level}</label>)}
      <p className="helper-text">不勾选任何强度表示不接受推理参数；none 是一个可选强度。</p>
    </div>}
    <Button variant="tertiary" size="small" aria-label={`清空 ${modelId} 能力配置`} onClick={() => onChange(capabilitiesDraft())}>清空能力配置</Button>
  </fieldset>;
}
