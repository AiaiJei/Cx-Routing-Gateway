import { useState } from "react";
import { getModelFamily, MODEL_FAMILIES, type ModelFamilySelection } from "../domain/model-family";
import { CustomSelect } from "./CustomSelect";
import { ModelFamilyFilter } from "./ModelFamilyFilter";

export function ModelSelect({ ariaLabel, models, value, onChange }: {
  ariaLabel: string;
  models: readonly string[];
  value: string[];
  onChange: (models: string[]) => void;
}) {
  const [family, setFamily] = useState<ModelFamilySelection>("all");
  const entries = [...new Set([...models, ...value])].map(model => ({ model, family: getModelFamily(model) }));
  const options = MODEL_FAMILIES.flatMap(group => entries.filter(entry => entry.family === group.id).map(entry => ({
    value: entry.model,
    label: entry.model,
    group: group.label,
    hidden: family !== "all" && entry.family !== family,
  })));

  return <div className="model-select">
    <ModelFamilyFilter ariaLabel={`${ariaLabel}分类`} value={family} families={entries.map(entry => entry.family)} onChange={setFamily} />
    <CustomSelect multiple ariaLabel={ariaLabel} value={value} options={options} placeholder="选择模型（可多选）"
      emptyMessage={family === "all" ? "暂无模型，请先测试上游连接" : "该分类暂无模型"} onChange={onChange} />
  </div>;
}
