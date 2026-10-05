import { index, layout, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  layout("routes/shell.tsx", [
    index("routes/saved.tsx"),
    route("profiles", "routes/profiles.tsx"),
    route("profiles/:username", "routes/profile.tsx"),
    route("reports", "routes/reports.tsx"),
  ]),
] satisfies RouteConfig;
