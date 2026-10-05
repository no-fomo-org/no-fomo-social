import type { PostListItem } from "@no-fomo/core";
import { Alert02Icon, Loading03Icon, SquareArrowUpRightIcon } from "@hugeicons/core-free-icons";
import { mediaErrorText } from "../../lib/media";
import { usePostMedia } from "../../lib/use-post-media";
import { Player } from "../player/player";
import { SetupSteps } from "../setup-steps";
import { Button, buttonClass } from "../ui/button";
import { Icon } from "../ui/icon";
import { Carousel } from "./carousel";

/** Mount with key={post.id}: all state here belongs to one post. */
export function MediaStage({ post, extensionId }: { post: PostListItem; extensionId: string | undefined }) {
  const { media, loading, error, retry, onLoadError } = usePostMedia(post.id, extensionId);
  const alt = post.accessibilityCaption ?? `Post by @${post.author.username}`;

  if (error) {
    return (
      <div className="flex size-full items-center justify-center overflow-y-auto overflow-x-hidden p-6">
        <div className="w-full min-w-0 max-w-md text-center text-white">
          <Icon icon={Alert02Icon} size={28} className="mx-auto text-white/70" />
          <p className="mt-3 text-[15px]" role="alert">{mediaErrorText(error)}</p>
          {error === "no_extension" && (
            <div className="mt-4 rounded-control bg-bg p-4 pt-0 text-left text-text"><SetupSteps /></div>
          )}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {error !== "not_found" && error !== "no_extension" && <Button onClick={retry}>Try again</Button>}
            <a href={post.permalink} target="_blank" rel="noopener noreferrer" className={buttonClass("primary")}>
              <Icon icon={SquareArrowUpRightIcon} />
              Open on Instagram
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !media) {
    return (
      <div className="relative flex size-full items-center justify-center">
        <img src={post.thumbUrl} alt={alt} className="max-h-full max-w-full object-contain opacity-60" />
        <Icon icon={Loading03Icon} size={32} className="absolute text-white/80 motion-safe:animate-spin" />
      </div>
    );
  }

  if (post.kind === "carousel" && media.parts.length > 1) {
    return <Carousel parts={media.parts} postId={post.id} alt={alt} onLoadError={onLoadError} />;
  }

  const part = media.parts[0]!;
  if (part.kind === "video" && part.videoUrl) {
    return <Player key={part.videoUrl} src={part.videoUrl} poster={post.thumbUrl} postId={post.id} arrowSeek="plain" onLoadError={onLoadError} />;
  }
  return (
    <div className="flex size-full items-center justify-center">
      <img src={part.imageUrl ?? post.thumbUrl} alt={alt} onError={onLoadError} className="max-h-full max-w-full object-contain" />
    </div>
  );
}
