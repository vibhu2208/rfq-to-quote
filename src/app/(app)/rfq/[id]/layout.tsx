export default function RfqDetailLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative left-1/2 flex min-h-0 w-screen max-w-[100vw] flex-1 -translate-x-1/2 flex-col -my-4 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[96rem]">{children}</div>
    </div>
  );
}
