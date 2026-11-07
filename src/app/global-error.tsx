"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1rem", textAlign: "center", color: "#13203a" }}>
        <h1 style={{ fontSize: "1.75rem" }}>Something went wrong</h1>
        <p style={{ color: "#5b677d" }}>
          Please try again.{error.digest ? ` Reference: ${error.digest}` : ""}
        </p>
        <button
          onClick={() => reset()}
          style={{ marginTop: "1.5rem", padding: "0.6rem 1.2rem", background: "#101c35", color: "#fff", border: 0, borderRadius: 8, cursor: "pointer" }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
