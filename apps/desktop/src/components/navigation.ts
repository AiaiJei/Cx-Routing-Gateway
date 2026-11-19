import type { NavigationIconName } from "./NavigationIcon";

type Destination = { label: string; to: string; icon: NavigationIconName; group: string };

export const destinations: Destination[] = [
  { label: "总览", to: "/", icon: "overview", group: "工作区" },
  { label: "上游服务", to: "/upstreams", icon: "upstreams", group: "网关配置" },
  { label: "模型路由", to: "/routes", icon: "routes", group: "网关配置" },
  { label: "接入凭证", to: "/credentials", icon: "credentials", group: "网关配置" },
  { label: "请求日志", to: "/logs", icon: "logs", group: "运行记录" },
  { label: "设置", to: "/settings", icon: "settings", group: "偏好设置" },
];

export const navigationGroups = ["工作区", "网关配置", "运行记录", "偏好设置"];
