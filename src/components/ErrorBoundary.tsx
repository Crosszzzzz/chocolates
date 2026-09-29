import React from 'react';

// Catches render-time crashes anywhere below it so the app never goes black.
// Shows a branded fallback with a reload action instead of an empty #root.
//
// Note: this repo has no @types/react and tsc runs non-strict, so React
// types resolve loosely. The base class is cast to keep this file compiling
// exactly like the existing function components (see tsconfig.json).
interface ErrorBoundaryProps {
  children?: React.ReactNode;
}

interface ErrorBoundaryState {
  message: string | null;
}

const ComponentBase = React.Component as unknown as {
  new (props: ErrorBoundaryProps): {
    props: ErrorBoundaryProps;
    state: ErrorBoundaryState;
    setState(s: Partial<ErrorBoundaryState>): void;
  };
};

export class ErrorBoundary extends ComponentBase {
  state: ErrorBoundaryState = { message: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { message: error instanceof Error ? error.message : 'Unexpected error' };
  }

  componentDidCatch(error: unknown): void {
    // Log for devtools; never rethrow so the fallback stays visible.
    console.error('[ErrorBoundary]', error);
  }

  private handleReload(): void {
    window.location.reload();
  }

  render(): React.ReactNode {
    if (this.state.message !== null) {
      const message: string = this.state.message;
      const reload = (): void => this.handleReload();
      return (
        <div
          role="alert"
          className="w-screen min-h-dvh flex flex-col items-center justify-center gap-4 bg-[#faf6ef] dark:bg-[#080706] px-6 text-center"
        >
          <h1 className="text-2xl font-bold text-[#2b1a12] dark:text-[#fcf8f2]">
            Something went wrong loading the experience
          </h1>
          <p className="max-w-md text-sm text-[#5c4433] dark:text-[#d7c4b7]">
            The 3D view could not start ({message}). Your data is safe — try reloading.
          </p>
          <button
            type="button"
            onClick={reload}
            className="min-h-[44px] px-6 rounded-xl bg-[#d4af37] text-[#1a0f08] font-bold text-sm cursor-pointer"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
