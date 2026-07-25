export function AppLogo({ size = "md" }: { size?: "sm" | "md" }) {
  const sizeClass = size === "sm" ? "size-7 rounded-md" : "size-10 rounded-lg";

  return (
    <img
      src="/app-logo.svg"
      alt=""
      aria-hidden="true"
      className={`shrink-0 ${sizeClass}`}
    />
  );
}
