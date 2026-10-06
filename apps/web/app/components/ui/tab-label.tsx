/** Reserves the width of the bold label, so a tab does not grow when it becomes active. */
export function TabLabel({ children }: { children: string }) {
  return (
    <span className="grid">
      <span className="col-start-1 row-start-1">{children}</span>
      <span aria-hidden="true" className="invisible col-start-1 row-start-1 font-semibold">{children}</span>
    </span>
  );
}
