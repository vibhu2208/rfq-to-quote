export default function RfqDetailLayout({ children }: { children: React.ReactNode }) {
  // Full-bleed without CSS transform — transforms create a containing block that
  // traps position:fixed overlays (Recore, etc.) inside the scrolling main pane.
  return (
    <div className="relative -mx-3 flex min-h-0 w-auto flex-1 flex-col -my-3 px-3 sm:-mx-4 sm:px-5 lg:-mx-5 lg:px-6">
      <div className="mx-auto w-full max-w-[96rem] pb-6">{children}</div>
    </div>
  );
}
