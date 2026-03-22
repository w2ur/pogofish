export function App() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <main className="flex flex-1 items-center justify-center">
        <h1 className="text-4xl font-bold">Pogofish</h1>
      </main>
      <footer className="py-4 text-center text-sm text-neutral-500">
        Made with care by{" "}
        <a
          href="https://william.revah.paris"
          className="underline hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          William
        </a>
      </footer>
    </div>
  );
}
