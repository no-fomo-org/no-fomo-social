import { createContext, useContext, useState, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import type { AppSettings, SettingsUpdate } from "@no-fomo-social/core";
import { api } from "../lib/api";
import { Button, buttonClass } from "./ui/button";
import { Icon } from "./ui/icon";

const OpenSettings = createContext<() => void>(() => {});
export const useOpenSettings = () => useContext(OpenSettings);

const field =
  "h-9 w-full min-w-0 rounded-control border border-line bg-surface px-3 text-[14px] focus-visible:outline-2 focus-visible:outline-accent";

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  // Esc is a keyboard action: close at once, no fade.
  const [instant, setInstant] = useState(false);
  return (
    <OpenSettings.Provider value={() => { setInstant(false); setOpen(true); }}>
      {children}
      <Dialog.Root open={open} onOpenChange={(next, details) => { setInstant(!next && details.reason === "escape-key"); setOpen(next); }}>
        <Dialog.Portal>
          <Dialog.Backdrop data-instant={instant || undefined} className="fixed inset-0 z-[60] bg-scrim transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 data-[instant]:duration-0!" />
          <Dialog.Popup data-instant={instant || undefined} className="fixed left-1/2 top-1/2 z-[70] max-h-[90dvh] w-[min(480px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-sheet border border-line bg-paper p-5 shadow-pop transition-[scale,opacity] duration-200 ease-out-soft data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0 data-[ending-style]:duration-150 data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0 data-[instant]:duration-0!">
            {open && <SettingsForm onDone={() => setOpen(false)} />}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </OpenSettings.Provider>
  );
}

function SettingsForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const save = useMutation({
    mutationFn: (u: SettingsUpdate) => api.saveSettings(u),
    onSuccess: (s) => {
      qc.setQueryData<AppSettings>(["settings"], s);
      // A new key may unlock other models.
      void qc.invalidateQueries({ queryKey: ["models"] });
    },
  });
  const s = settings.data;
  const [key, setKey] = useState("");

  const submit = () => {
    const u: SettingsUpdate = {};
    if (key.trim()) u.openaiKey = key.trim();
    save.mutate(u, {
      onSuccess: () => {
        setKey("");
        onDone();
      },
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="grid gap-5"
    >
      <div className="flex items-center justify-between">
        <Dialog.Title className="text-[20px] font-semibold">Settings</Dialog.Title>
        <Dialog.Close className={buttonClass("ghost", "", "icon")} aria-label="Close" title="Close (Esc)">
          <Icon icon={Cancel01Icon} size={20} />
        </Dialog.Close>
      </div>

      <section className="grid gap-2">
        <label htmlFor="openai-key" className="text-[14px] font-medium">OpenAI key</label>
        {s?.openai.set && (
          <div className="flex items-center justify-between gap-2 text-[13px] text-muted">
            <span>
              Key saved, ends in <span className="font-mono">{s.openai.last4}</span>
            </span>
            <Button variant="ghost" onClick={() => save.mutate({ openaiKey: null })}>Remove</Button>
          </div>
        )}
        <input
          id="openai-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={s?.openai.set ? "Paste a new key to replace it" : "sk-..."}
          className={field}
        />
        <p className="text-[13px] text-muted">Your key stays on this computer. It is only sent to OpenAI when you analyze a post. You pick the models and the report language in the Report tab of each post.</p>
      </section>

      {save.isError && <p role="alert" className="text-[13px] text-danger">Could not save. Check the values and try again.</p>}
      <div className="flex justify-end gap-2">
        <Dialog.Close className={buttonClass("ghost")}>Cancel</Dialog.Close>
        <button type="submit" disabled={save.isPending || settings.isPending} className={buttonClass("primary")}>Save</button>
      </div>
    </form>
  );
}
