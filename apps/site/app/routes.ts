import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("privacy", "routes/privacy.tsx"),
  route("install.sh", "routes/install-sh.ts"),
  route("install.ps1", "routes/install-ps1.ts"),
] satisfies RouteConfig;
