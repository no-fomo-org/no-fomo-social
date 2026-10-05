import { Outlet } from "react-router";
import { SettingsProvider } from "../components/settings-dialog";

export default function Shell() {
  return (
    <SettingsProvider>
      <div className="min-h-[100dvh]">
        <Outlet />
      </div>
    </SettingsProvider>
  );
}
