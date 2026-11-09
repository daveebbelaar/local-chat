import { isValidElement, useRef, useState, type ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openUrl } from "@tauri-apps/plugin-opener";

/** A fenced code block with a Copy button. */
function CodeBlock(props: ComponentProps<"pre">) {
  const pre = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(pre.current?.innerText ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // The fence's language arrives as class "language-python" on the inner <code>.
  const child = props.children;
  const className = isValidElement<{ className?: string }>(child) ? (child.props.className ?? "") : "";
  const language = /language-(\S+)/.exec(className)?.[1] ?? "text";

  return (
    <div className="code-block">
      <div className="code-header">
        <span>{language}</span>
        <button className="copy" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre ref={pre}>{child}</pre>
    </div>
  );
}

/** Links open in the browser. Without this, a click would load the page inside the app window. */
function Link({ href, children }: ComponentProps<"a">) {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (href) openUrl(href);
      }}
    >
      {children}
    </a>
  );
}

/** Model output as markdown. react-markdown never renders raw HTML, so an answer cannot inject scripts. */
export default function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: CodeBlock, a: Link }}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
