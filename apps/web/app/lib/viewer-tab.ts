import type { DetailsTab } from "../components/viewer/post-details";

/** The tab to show when the viewer opens: the page's start tab if it has one, else the last one used. */
export const tabOnOpen = (current: DetailsTab, initial: DetailsTab | undefined): DetailsTab => initial ?? current;
