export default function ARGOSExecutiveButton({
  children,
  variant = "primary",
  size = "md",
  icon: Icon,
  className = "",
  type = "button",
  ...props
}) {
  const classes = [
    "argos-executive-button",
    `argos-executive-button--${variant}`,
    size !== "md" ? `argos-executive-button--${size}` : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} {...props}>
      {Icon ? <Icon size={16} strokeWidth={2.2} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
