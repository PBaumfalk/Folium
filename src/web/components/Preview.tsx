import { Monitor, Smartphone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PageContent } from '../../shared/content';
import type { Theme } from '../../shared/theme';
import { api } from '../lib/api';

/** Rendert den aktuellen (auch ungespeicherten) Stand mit demselben Renderer wie die öffentliche Seite. */
export function usePreviewHtml(content: PageContent, theme: Theme, banner?: string) {
  const [html, setHtml] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify([content, theme, banner]);
  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(() => {
      api
        .html('/api/v1/preview', { content, theme, banner }, ctl.signal)
        .then((h) => {
          setHtml(h);
          setError(null);
        })
        .catch((e) => {
          if ((e as Error).name !== 'AbortError') setError((e as Error).message);
        });
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { html, error };
}

export function PreviewFrame({ html, mode, title, height }: { html: string; mode: 'mobile' | 'desktop'; title: string; height?: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  if (mode === 'mobile') {
    return (
      <div className="phone" style={height ? { height } : undefined}>
        <iframe title={title} srcDoc={html} sandbox="allow-same-origin" />
      </div>
    );
  }
  const scale = Math.min(1, w / 1280);
  const vh = Math.round((height ?? 700) / scale);
  return (
    <div className="desk" ref={wrap}>
      <div className="chrome" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="vp" style={{ height: Math.round(vh * scale) }}>
        <iframe title={title} srcDoc={html} sandbox="allow-same-origin" style={{ width: 1280, height: vh, transform: `scale(${scale})` }} />
      </div>
    </div>
  );
}

export function Preview({ content, theme, publicUrl }: { content: PageContent; theme: Theme; publicUrl?: string }) {
  const [mode, setMode] = useState<'mobile' | 'desktop'>('mobile');
  const { html, error } = usePreviewHtml(content, theme);
  return (
    <section className="preview" aria-label="Vorschau">
      <div className="bar">
        <div className="seg" role="group" aria-label="Ansicht">
          <button aria-pressed={mode === 'mobile'} onClick={() => setMode('mobile')}>
            <Smartphone className="lucide" aria-hidden="true" /> Smartphone
          </button>
          <button aria-pressed={mode === 'desktop'} onClick={() => setMode('desktop')}>
            <Monitor className="lucide" aria-hidden="true" /> Desktop
          </button>
        </div>
        {publicUrl && <span className="muted small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{publicUrl}</span>}
      </div>
      {error && <div className="callout warn">Die Vorschau kann gerade nicht aktualisiert werden: {error}</div>}
      <div className="stage">{html ? <PreviewFrame html={html} mode={mode} title={`Vorschau ${mode === 'mobile' ? 'Smartphone' : 'Desktop'}`} /> : <div className="skeleton" style={{ width: 390, height: 600 }} />}</div>
    </section>
  );
}
