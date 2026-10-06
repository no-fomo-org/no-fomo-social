import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Menu } from "@base-ui/react/menu";
import { Alert02Icon, Copy01Icon, Delete02Icon, Download04Icon, MoreHorizontalIcon, RefreshIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { REPORT_LANGUAGES, REPORT_MODELS, TRANSCRIBE_MODELS, type AnalyzeChoice, type ModelsInfo, type PostListItem, type PostMedia } from "@no-fomo/core";
import { api } from "../../lib/api";
import { startAnalysis } from "../../lib/analyze";
import {
  analyzeErrorText, isWorking, reportFileName, reportView, safeMarkdownUrl, startingChoice, stepText, usableModels,
} from "../../lib/report";
import { LogoSymbol } from "../logo";
import { DeleteConfirm } from "../reports/delete-report";
import { useOpenSettings } from "../settings-dialog";
import { Button, buttonClass } from "../ui/button";
import { Icon } from "../ui/icon";
import { OptionPicker } from "../ui/option-picker";
import { POPUP } from "../ui/popup";

/** Shown until OpenAI answers which models the key can use. */
const ALL_MODELS: ModelsInfo = {
  report: REPORT_MODELS.map((m) => ({ ...m, available: true })),
  transcribe: TRANSCRIBE_MODELS.map((m) => ({ ...m, available: true })),
  checked: false,
};
const LANGUAGE_OPTIONS = REPORT_LANGUAGES.map((l) => ({ id: l.name, label: l.name, sublabel: l.native === l.name ? undefined : l.native }));

/** Mount with key={post.id}: start state and errors belong to one post. */
export function ReportPanel({ post, extensionId }: { post: PostListItem; extensionId: string | undefined }) {
  const qc = useQueryClient();
  const openSettings = useOpenSettings();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const report = useQuery({
    queryKey: ["report", post.id],
    queryFn: () => api.report(post.id),
    refetchInterval: (q) => (isWorking(q.state.data ?? null) ? 1500 : false),
  });
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [picked, setPicked] = useState<AnalyzeChoice | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const hasKey = !!settings.data?.openai.set;
  const models = useQuery({ queryKey: ["models"], queryFn: api.models, enabled: hasKey, staleTime: 10 * 60_000 });
  const s = settings.data;
  const choice =
    picked ??
    startingChoice(
      { reportModel: s?.reportModel ?? "", transcribeModel: s?.transcribeModel ?? "", language: s?.reportLanguage ?? "" },
      models.data ?? ALL_MODELS,
    );
  const r = report.data ?? null;
  const view = reportView({ hasKey, report: r, starting, startError });
  const markdown = r?.markdown ?? "";

  const analyze = async () => {
    setStarting(true);
    setStartError(null);
    const res = await startAnalysis(post.id, extensionId, choice);
    if (res.ok && res.media) qc.setQueryData<PostMedia>(["media", post.id], res.media);
    if (res.ok) {
      setChoosing(false);
      // The server remembers this choice; the next post starts from it.
      void qc.invalidateQueries({ queryKey: ["settings"] });
    } else {
      setStartError(res.error);
    }
    await report.refetch();
    setStarting(false);
  };
  const choices = (
    <ChoiceForm value={choice} onChange={setPicked} models={models.data ?? ALL_MODELS} />
  );

  // A finished job changes search results and the Reports tab.
  const working = isWorking(r);
  const wasWorking = useRef(working);
  useEffect(() => {
    if (wasWorking.current && !working) {
      void qc.invalidateQueries({ queryKey: ["posts"] });
      void qc.invalidateQueries({ queryKey: ["reports"] });
      void qc.invalidateQueries({ queryKey: ["authors", "reports"] });
      void qc.invalidateQueries({ queryKey: ["known"] });
    }
    wasWorking.current = working;
  }, [working, qc]);

  const copy = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: reportFileName(post.author.username, post.code) });
    a.click();
    URL.revokeObjectURL(url);
  };

  if (report.isPending || settings.isPending) return <p className="px-5 py-5 text-[13px] text-muted">Loading the report</p>;

  return (
    <div className="grid gap-4 px-5 py-5">
      {view.error && (
        <p role="alert" className="flex items-start gap-2 text-[14px] text-danger">
          <Icon icon={Alert02Icon} size={16} className="mt-0.5" />
          {analyzeErrorText(view.error, r?.errorMessage ?? null)}
        </p>
      )}

      {view.kind === "no_key" && (
        <div className="grid gap-3">
          <p className="text-[15px]">Add your OpenAI key in Settings to analyze posts.</p>
          <div>
            <Button variant="primary" onClick={openSettings}>Open Settings</Button>
          </div>
        </div>
      )}

      {view.kind === "empty" && (
        <div className="grid gap-3">
          <p className="text-[15px]">
            Get a short report on this post: what it says, what it shows, and what it mentions. You can copy it or download it as Markdown.
          </p>
          <p className="text-[13px] text-muted">Uses your OpenAI key. Usually a few cents per post.</p>
          {hasKey ? (
            <>
              {choices}
              <div>
                <Button variant="primary" onClick={analyze}>{view.error ? "Try again" : "Analyze"}</Button>
              </div>
            </>
          ) : (
            <div>
              <Button variant="primary" onClick={openSettings}>Open Settings</Button>
            </div>
          )}
        </div>
      )}

      {view.kind === "working" && (
        <p role="status" className="flex items-center gap-2 text-[15px]">
          <LogoSymbol size={16} loading title="" className="text-accent" />
          {starting && !isWorking(r) ? "Starting" : stepText(r?.step ?? null)}
        </p>
      )}

      {view.kind === "report" && choosing && (
        <div className="grid gap-3 border-b border-line pb-5">
          {choices}
          <div className="flex gap-2">
            <Button variant="primary" onClick={analyze}>Analyze</Button>
            <Button variant="ghost" onClick={() => setChoosing(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {view.kind === "report" && (
        <>
          {/* Take the report with you first; rarer actions wait in the menu. */}
          <div className="grid gap-3 border-b border-line pb-4">
            <div className="flex items-center gap-2">
              <Button variant="primary" onClick={download}>
                <Icon icon={Download04Icon} />
                Download .md
              </Button>
              <Button onClick={copy} title="Copy as Markdown">
                <Icon icon={copied ? Tick02Icon : Copy01Icon} />
                {copied ? "Copied" : "Copy"}
              </Button>
              <ReportMenu
                onAnalyzeAgain={hasKey ? () => { setDeleting(false); setChoosing(true); } : openSettings}
                onDelete={() => { setChoosing(false); setDeleting(true); }}
              />
            </div>
            {deleting && <DeleteConfirm postId={post.id} onClose={() => setDeleting(false)} />}
          </div>
          <article className="report-md">
            <Markdown
              skipHtml
              urlTransform={safeMarkdownUrl}
              disallowedElements={["img"]}
              components={{
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                ),
              }}
            >
              {markdown}
            </Markdown>
          </article>
        </>
      )}
    </div>
  );
}

function ChoiceForm({ value, onChange, models }: { value: AnalyzeChoice; onChange: (c: AnalyzeChoice) => void; models: ModelsInfo }) {
  const asOptions = (list: ModelsInfo["report"]) => usableModels(list).map((m) => ({ id: m.id, label: m.id, sublabel: m.note }));
  return (
    <div className="grid gap-3">
      <OptionPicker label="Report model" options={asOptions(models.report)} value={value.reportModel} onChange={(reportModel) => onChange({ ...value, reportModel })} />
      <OptionPicker
        label="Speech to text"
        options={asOptions(models.transcribe)}
        value={value.transcribeModel}
        onChange={(transcribeModel) => onChange({ ...value, transcribeModel })}
      />
      <OptionPicker label="Report language" options={LANGUAGE_OPTIONS} value={value.language} onChange={(language) => onChange({ ...value, language })} />
    </div>
  );
}

/** Analyze again and Delete: needed now and then, so they stay out of the way. */
function ReportMenu({ onAnalyzeAgain, onDelete }: { onAnalyzeAgain: () => void; onDelete: () => void }) {
  const row = "flex cursor-default items-center gap-2.5 rounded-tile px-2.5 py-2 text-[14px] outline-none data-[highlighted]:bg-surface";
  return (
    <Menu.Root>
      <Menu.Trigger className={buttonClass("ghost", "ms-auto", "icon")} aria-label="More report actions" title="More">
        <Icon icon={MoreHorizontalIcon} size={18} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="end" className="z-[60]">
          <Menu.Popup className={`min-w-48 p-1 ${POPUP}`}>
            <Menu.Item onClick={onAnalyzeAgain} className={row}>
              <Icon icon={RefreshIcon} className="text-muted" />
              Analyze again
            </Menu.Item>
            <Menu.Item onClick={onDelete} className={`${row} text-danger`}>
              <Icon icon={Delete02Icon} />
              Delete report
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
