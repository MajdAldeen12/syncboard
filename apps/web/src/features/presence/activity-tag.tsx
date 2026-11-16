import type { Activity } from "@syncboard/core/presence";
import type { CSSProperties } from "react";

function describe(activity: readonly Activity[]): string {
  const [first, ...others] = activity;
  if (!first) return "";
  if (others.length > 0) return `${first.user.name} and ${others.length} more`;
  return first.doing === "editing"
    ? `${first.user.name} is editing`
    : `${first.user.name} is moving this`;
}

/**
 * The outline for a card or column somebody else has open or in hand, in
 * that person's colour. Spread it over the element's own style and classes.
 */
export function activityOutline(activity: readonly Activity[] | undefined): {
  style: CSSProperties | undefined;
  className: string;
} {
  const first = activity?.[0];
  if (!first) return { style: undefined, className: "" };

  return {
    style: { "--presence": first.user.color } as CSSProperties,
    className: "ring-2 ring-(--presence)",
  };
}

interface ActivityTagProps {
  activity: readonly Activity[] | undefined;
  /** What the tag is on, so that a column's tag can be told from its cards'. */
  item: "card" | "column";
}

/**
 * Says who else is editing or moving a card or column. Sits on the top edge
 * of the element, which must be positioned.
 */
export function ActivityTag({ activity, item }: ActivityTagProps) {
  const first = activity?.[0];
  if (!activity || !first) return null;

  return (
    <span
      data-presence-activity={first.doing}
      data-presence-item={item}
      title={activity.map((each) => each.user.name).join(", ")}
      style={{ backgroundColor: first.user.color }}
      className={`pointer-events-none absolute left-2 z-10 max-w-[calc(100%-1rem)] truncate rounded px-1.5 text-[10px]/4 font-medium text-white shadow-sm ${
        item === "card" ? "-top-1.5" : "-top-2"
      }`}
    >
      {describe(activity)}
    </span>
  );
}
