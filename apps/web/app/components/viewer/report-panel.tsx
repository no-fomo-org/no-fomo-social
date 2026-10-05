import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert02Icon, Copy01Icon, Download04Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import type { PostListItem, PostMedia } from "@no-fomo/core";
import { api } from "../../lib/api";
import { startAnalysis } from "../../lib/analyze";
import { analyzeErrorText, isWorking, reportFileName, reportView, stepText } from "../../lib/report";
import { useOpenSettings } from "../settings-dialog";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";

const safeUrl = (url: string) => (/^https?:\/\//i.test(url) ? url : "");

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

  const hasKey = !!settings.data?.openai.set;
  const r = report.data ?? null;
  const view = reportView({ hasKey, report: r, starting, startError });
  const markdown = r?.markdown ?? "";

  const analyze = async () => {
    setStarting(true);
    setStartError(null);
    const res = await startAnalysis(post.id, extensionId);
    if (res.ok && res.media) qc.setQueryData<PostMedia>(["media", post.id], res.media);
    if (!res.ok) setStartError(res.error);
    await report.refetch();
    setStarting(false);
  };

  // A finished job changes the grid's "Has report" filter and search results.
  const working = isWorking(r);
  const wasWorking = useRef(working);
  useEffect(() => {
    if (wasWorking.current && !working) void qc.invalidateQueries({ queryKey: ["posts"] });
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
          <div>
            {hasKey ? (
              <Button variant="primary" onClick={analyze}>Analyze</Button>
            ) : (
              <Button variant="primary" onClick={openSettings}>Open Settings</Button>
            )}
          </div>
        </div>
      )}

      {view.kind === "working" && (
        <p role="status" className="flex items-center gap-2 text-[15px]">
          <Icon icon={Loading03Icon} size={16} className="motion-safe:animate-spin" />
          {starting && !isWorking(r) ? "Starting" : stepText(r?.step ?? null)}
        </p>
      )}

      {view.kind === "report" && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button onClick={copy}>
              <Icon icon={Copy01Icon} />
              {copied ? "Copied" : "Copy as Markdown"}
            </Button>
            <Button onClick={download}>
              <Icon icon={Download04Icon} />
              Download .md
            </Button>
            <Button variant="ghost" onClick={hasKey ? analyze : openSettings}>Analyze again</Button>
          </div>
          <article className="report-md">
            <Markdown
              skipHtml
              urlTransform={safeUrl}
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
