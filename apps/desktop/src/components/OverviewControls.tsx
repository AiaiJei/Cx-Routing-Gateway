import type { OverviewRange } from "../domain/overview-analytics";
import { CustomSelect } from "./CustomSelect";

type Props = { range: OverviewRange; refreshing: boolean; onRangeChange: (range: OverviewRange) => void; onRefresh: () => void };

export function OverviewControls({ range, refreshing, onRangeChange, onRefresh }: Props) {
  return <div className="concept-toolbar" role="group" aria-label="总览操作">
    <span className="scope-label">统计范围</span>
    <CustomSelect ariaLabel="统计范围" value={range} options={[
      { value: "today", label: "今天（本地时间）" },
      { value: "24h", label: "最近 24 小时" },
      { value: "retained", label: "已保留记录" },
    ]} onChange={value => onRangeChange(value as OverviewRange)} />
    <button className="refresh-button" type="button" disabled={refreshing} onClick={onRefresh}>{refreshing ? "刷新中…" : "刷新数据"}</button>
  </div>;
}
