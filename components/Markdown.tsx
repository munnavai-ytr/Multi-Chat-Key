'use client';

import React, { useMemo, useState, useContext } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Copy, Check, Play, RotateCw } from 'lucide-react';
import { useUIStore } from '@/store/ui';

export const StreamingContext = React.createContext<boolean>(false);

function splitBlocks(src: string) {
  const out: string[] = [];
  let cur = '';
  let fence = false;
  for (const line of src.split('\n')) {
    if (line.trimStart().startsWith('```')) fence = !fence;
    if (line === '' && !fence && cur) {
      out.push(cur);
      cur = '';
    } else {
      cur += (cur ? '\n' : '') + line;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function CodeBlock({ children }: React.ComponentPropsWithoutRef<'pre'>) {
  const [copied, setCopied] = useState(false);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const isStreaming = useContext(StreamingContext);
  const { setArtifact } = useUIStore();

  const extractText = (node: any): string => {
    if (typeof node === 'string') return node;
    if (typeof node === 'number') return String(node);
    if (!node) return '';
    if (Array.isArray(node)) return node.map(extractText).join('');
    if (node?.props?.children) return extractText(node.props.children);
    return '';
  };

  const child = React.isValidElement(children) ? children : null;
  const className = (child?.props as any)?.className || '';
  const match = /language-([a-zA-Z0-9_-]+)/.exec(className);
  const language = match ? match[1] : 'code';

  const rawCode = extractText(children).replace(/\n$/, '');
  const langLower = language.toLowerCase();
  const isPreviewable = ['html', 'svg', 'jsx', 'tsx', 'react'].includes(langLower);
  const isRunnable = ['python', 'py', 'javascript', 'js'].includes(langLower);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rawCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback
    }
  };

  const handlePreview = () => {
    if (isStreaming) return;
    setArtifact({
      lang: langLower,
      code: rawCode,
      title: `${langLower.toUpperCase()} Artifact`,
    });
  };

  const handleRun = async () => {
    setRunning(true);
    setOutput(null);
    try {
      const { runCode } = await import('@/lib/runner');
      const res = await runCode(langLower as any, rawCode, (status) => {
        setOutput(status);
      });
      setOutput(res.out || '(No output)');
    } catch (err: any) {
      setOutput('Error: ' + String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="my-3 rounded-xl border border-border bg-surface2/80 overflow-hidden shadow-xs max-w-full">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-surface2 border-b border-border text-xs text-muted select-none">
        <span className="font-mono text-[11px] font-medium lowercase tracking-wider">
          {language}
        </span>
        <div className="flex items-center gap-1.5">
          {isPreviewable && (
            <button
              type="button"
              onClick={handlePreview}
              disabled={isStreaming}
              aria-label="Preview artifact"
              title={
                isStreaming
                  ? 'Preview available when generation finishes'
                  : 'Open sandboxed preview'
              }
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                isStreaming
                  ? 'opacity-40 cursor-not-allowed text-muted'
                  : 'bg-accent/10 hover:bg-accent/20 text-accent cursor-pointer'
              }`}
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Preview</span>
            </button>
          )}
          {isRunnable && (
            <button
              type="button"
              onClick={handleRun}
              disabled={isStreaming || running}
              aria-label="Run code"
              title="Run code"
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                isStreaming || running
                  ? 'opacity-40 cursor-not-allowed text-muted'
                  : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 cursor-pointer'
              }`}
            >
              {running ? <RotateCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 fill-current" />}
              <span>{running ? 'Running...' : 'Run'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? 'Copied' : 'Copy code'}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md hover:bg-surface text-muted hover:text-text transition-colors text-[11px] font-medium cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-500 font-medium">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Horizontally scrollable code area */}
      <pre className="overflow-x-auto p-3.5 text-xs sm:text-sm font-mono leading-relaxed bg-transparent m-0 focus:outline-none">
        {children}
      </pre>

      {/* Output Panel */}
      {output !== null && (
        <div className="border-t border-border bg-surface/50 p-3.5 pt-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted">Output</span>
            <button
              type="button"
              onClick={() => setOutput(null)}
              className="text-[10px] text-muted hover:text-text cursor-pointer"
            >
              Clear
            </button>
          </div>
          <div className="max-h-[240px] overflow-auto bg-bg p-2 rounded-lg border border-border text-xs font-mono whitespace-pre-wrap text-text">
            {output}
          </div>
          <p className="mt-2 text-[10px] text-muted">Runs locally in your browser. No file system or network access guarantees; do not run code you do not trust.</p>
        </div>
      )}
    </div>
  );
}


export const SourcesContext = React.createContext<{ id?: number; title: string; url: string }[]>([]);

function SafeLink({ href, children, ...props }: React.ComponentPropsWithoutRef<'a'>) {
  const sources = useContext(SourcesContext);

  if (href?.startsWith('cite:s')) {
    const sId = parseInt(href.replace('cite:s', ''), 10);
    const src = sources.find((s) => s.id === sId);
    return (
      <a
        href={src?.url || '#'}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          if (!src?.url) e.preventDefault();
        }}
        title={src ? `${src.title}\n${src.url}` : `Source S${sId}`}
        className="inline-flex items-center justify-center px-1.5 py-0.2 mx-0.5 rounded text-[10px] font-mono font-semibold bg-accent/15 text-accent hover:bg-accent hover:text-white transition-all align-super no-underline cursor-pointer"
      >
        S{sId}
      </a>
    );
  }

  const isSafe = /^https?:\/\//i.test(href || '') || /^mailto:/i.test(href || '');
  if (!isSafe) {
    return <span>{children}</span>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent underline underline-offset-2 hover:opacity-85 font-medium transition-opacity"
      {...props}
    >
      {children}
    </a>
  );
}

function linkifyCitations(src: string): string {
  if (!/\[S\d+\]/.test(src)) return src;
  const parts = src.split(/(```[\s\S]*?```)/g);
  return parts
    .map((part, idx) => {
      if (idx % 2 === 1) return part;
      return part.replace(/\[S(\d+)\]/g, '[S$1](cite:s$1)');
    })
    .join('');
}

const Block = React.memo(({ text }: { text: string }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    rehypePlugins={[rehypeHighlight]}
    components={{ pre: CodeBlock, a: SafeLink }}
  >
    {text}
  </ReactMarkdown>
));
Block.displayName = 'MarkdownBlock';

export function Markdown({
  content,
  isStreaming = false,
  sources = [],
}: {
  content: string;
  isStreaming?: boolean;
  sources?: { id?: number; title: string; url: string }[];
}) {
  const processedContent = useMemo(() => linkifyCitations(content), [content]);
  const blocks = useMemo(() => splitBlocks(processedContent), [processedContent]);

  return (
    <StreamingContext.Provider value={isStreaming}>
      <SourcesContext.Provider value={sources}>
        <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none break-words">
          {blocks.map((b, i) => (
            <Block key={i} text={b} />
          ))}
          {/* Real sources list at the bottom for research reports */}
          {!isStreaming && sources.some((s) => typeof s.id === 'number') && (
            <div className="mt-6 pt-4 border-t border-border/70 not-prose">
              <h4 className="text-xs font-semibold text-text uppercase tracking-wider mb-2.5">
                Sources &amp; References
              </h4>
              <div className="space-y-1.5">
                {sources
                  .filter((s): s is { id: number; title: string; url: string } => typeof s.id === 'number')
                  .sort((a, b) => a.id - b.id)
                  .map((src) => (
                    <div key={src.id} className="flex items-start gap-2 text-xs">
                      <span className="font-mono text-accent font-semibold shrink-0">
                        [S{src.id}]
                      </span>
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-text hover:text-accent hover:underline truncate"
                        title={src.title || src.url}
                      >
                        {src.title || src.url}
                      </a>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </SourcesContext.Provider>
    </StreamingContext.Provider>
  );
}
