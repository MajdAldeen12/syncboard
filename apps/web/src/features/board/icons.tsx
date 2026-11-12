const ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export function GripIcon() {
  return (
    <svg {...ICON_PROPS} fill="currentColor" stroke="none">
      <circle cx="5.5" cy="3.5" r="1.25" />
      <circle cx="10.5" cy="3.5" r="1.25" />
      <circle cx="5.5" cy="8" r="1.25" />
      <circle cx="10.5" cy="8" r="1.25" />
      <circle cx="5.5" cy="12.5" r="1.25" />
      <circle cx="10.5" cy="12.5" r="1.25" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M8 3.5v9M3.5 8h9" />
    </svg>
  );
}

export function PencilIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M11 2.5 13.5 5 5.5 13H3v-2.5l8-8ZM9.5 4l2.5 2.5" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8.5h6l.5-8.5M6.75 7v3.5M9.25 7v3.5" />
    </svg>
  );
}
