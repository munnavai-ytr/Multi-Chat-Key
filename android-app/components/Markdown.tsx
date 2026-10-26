'use client';

import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Copy, Check, Eye } from 'lucide-react';
import { useUIStore } from '@/store/ui';

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

function CodeBlock({ children, isStreaming }: React.ComponentPropsWithoutRef<'pre'> & { isStreaming?: boolean }) {
  const [copied, setCopied] = useState(false);
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
  const showPreview = !isStreaming && ['html', 'svg', 'jsx', 'tsx'].includes(language);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rawCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback
    }
  };

  return (
    <div className="my-3 rounded-xl border border-border bg-surface2/80 overflow-hidden shadow-xs max-w-full">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-surface2 border-b border-border text-xs text-muted select-none">
        <span className="font-mono text-[11px] font-medium lowercase tracking-wider">
          {language}
        </span>
        <div className="flex items-center gap-1">
          {showPreview && (
            <button
              type="button"
              onClick={() => setArtifact({ lang: language, code: rawCode })}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-md hover:bg-surface text-muted hover:text-text transition-colors text-[11px] font-medium cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview</span>
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
    </div>
  );
}

function SafeLink({ href, children, ...props }: React.ComponentPropsWithoutRef<'a'>) {
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

const Block = React.memo(({ text, isStreaming }: { text: string, isStreaming?: boolean }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    rehypePlugins={[rehypeHighlight]}
    components={{ pre: (props) => <CodeBlock {...props} isStreaming={isStreaming} />, a: SafeLink }}
  >
    {text}
  </ReactMarkdown>
));
Block.displayName = 'MarkdownBlock';

export function Markdown({ content, isStreaming }: { content: string, isStreaming?: boolean }) {
  const blocks = useMemo(() => splitBlocks(content), [content]);
  return (
    <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none break-words">
      {blocks.map((b, i) => (
        <Block key={i} text={b} isStreaming={isStreaming} />
      ))}
    </div>
  );
}
