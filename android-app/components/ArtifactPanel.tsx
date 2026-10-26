'use client';
import { useState } from 'react';
import { X, Copy, Download, RefreshCw, Maximize2, Code, Eye } from 'lucide-react';
import { useUIStore } from '@/store/ui';
import { buildSrcDoc } from '@/lib/artifact';

export function ArtifactPanel() {
  const { artifact, setArtifact } = useUIStore();
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [fullscreen, setFullscreen] = useState(false);

  if (!artifact) return null;

  const handleCopy = () => navigator.clipboard.writeText(artifact.code);
  const handleDownload = () => {
    const blob = new Blob([artifact.code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `artifact.${artifact.lang === 'svg' ? 'svg' : 'html'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`fixed z-40 bg-surface border-l border-border flex flex-col shadow-2xl transition-all duration-300 ease-in-out ${fullscreen ? 'inset-0' : 'top-0 right-0 h-full w-full sm:w-1/2'}`}>
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-1">
          <button onClick={() => setActiveTab('preview')} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${activeTab === 'preview' ? 'bg-surface2 text-text' : 'text-muted'}`}><Eye className="w-4 h-4 inline mr-1" />Preview</button>
          <button onClick={() => setActiveTab('code')} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${activeTab === 'code' ? 'bg-surface2 text-text' : 'text-muted'}`}><Code className="w-4 h-4 inline mr-1" />Code</button>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleCopy} className="p-1.5 rounded-lg text-muted hover:text-text"><Copy className="w-4 h-4" /></button>
          <button onClick={handleDownload} className="p-1.5 rounded-lg text-muted hover:text-text"><Download className="w-4 h-4" /></button>
          <button onClick={() => setFullscreen(!fullscreen)} className="p-1.5 rounded-lg text-muted hover:text-text"><Maximize2 className="w-4 h-4" /></button>
          <button onClick={() => setArtifact(null)} className="p-1.5 rounded-lg text-muted hover:text-rose-500"><X className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'preview' ? (
          <iframe sandbox="allow-scripts" srcDoc={buildSrcDoc(artifact.lang, artifact.code)} className="w-full h-full bg-white" />
        ) : (
          <pre className="w-full h-full p-4 overflow-auto text-xs font-mono text-text bg-surface2"><code>{artifact.code}</code></pre>
        )}
      </div>
      <div className="p-2 text-[10px] text-muted border-t border-border text-center">Runs in a sandbox. Network access from generated code is not blocked, so do not paste secrets into previews.</div>
    </div>
  );
}
