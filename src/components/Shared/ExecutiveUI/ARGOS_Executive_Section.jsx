export default function ARGOSExecutiveSection({
  children,
  surface = false,
  className = "",
  as: Component = "section",
  ...props
}) {
  const classes = [
    "argos-executive-section",
    surface ? "argos-executive-section--surface" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Component className={classes} {...props}>
      {children}
    </Component>
  );
}
