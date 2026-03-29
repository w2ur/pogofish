import type { ReactNode } from "react";
import { Nav } from "./Nav";

interface LayoutProps {
  children: ReactNode;
  minimaxProgress: number;
}

export function Layout({ children, minimaxProgress }: LayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <Nav minimaxProgress={minimaxProgress} />
      <main className="flex flex-1 flex-col">{children}</main>
      <footer className="py-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Made with care by{" "}
        <a
          href="https://william.revah.paris"
          className="underline hover:text-zinc-700 dark:hover:text-zinc-300"
          target="_blank"
          rel="noopener noreferrer"
        >
          William
        </a>
      </footer>
    </div>
  );
}
