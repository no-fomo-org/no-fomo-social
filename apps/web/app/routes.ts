import { index, layout, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  layout("routes/shell.tsx", [
    index("routes/home.tsx"),
    route("saved", "routes/saved.tsx"),
    route("reports", "routes/reports.tsx"),
  ]),
] satisfies RouteConfig;
