import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class RootErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, details: ErrorInfo): void {
    // Keep a local diagnostic for developers without showing internal details to users.
    console.error("Application render failed", error, details.componentStack);
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main className="glass center" role="alert">
          <h1>Stockroom ran into a problem</h1>
          <p className="mute">Reload the page to try again.</p>
          <button className="primary" onClick={() => window.location.reload()}>Reload application</button>
        </main>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("The application root element is missing.");

createRoot(rootElement).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
);
