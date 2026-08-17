import { useEffect, useRef } from 'react';

interface WebviewPanelProps {
  id: string;
  htmlContent: string;
  onMessage?: (message: any) => void;
}

export default function WebviewPanel({ id, htmlContent, onMessage }: WebviewPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      // Security Check: Only accept messages originating from our iframe element (Module 101)
      if (iframeRef.current && e.source === iframeRef.current.contentWindow) {
        const payload = e.data;
        if (payload && typeof payload === 'object' && payload.type) {
          // Schema-validated messages forwarding
          if (onMessage) {
            onMessage(payload);
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onMessage]);

  // Inject content securely using srcdoc with strict Content Security Policy meta tags
  const secureSrcDoc = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
        <style>
          body {
            margin: 0;
            padding: 8px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 11px;
            color: #cccccc;
            background-color: #1b1b1c;
          }
        </style>
      </head>
      <body>
        ${htmlContent}
        <script>
          // Helper tool for extension webview script messaging
          window.vscode = {
            postMessage: function(message) {
              window.parent.postMessage(message, '*');
            }
          };
        </script>
      </body>
    </html>
  `;

  return (
    <iframe
      ref={iframeRef}
      id={`webview-${id}`}
      title={`Extension Webview ${id}`}
      srcDoc={secureSrcDoc}
      sandbox="allow-scripts" // STRICTION: no allow-same-origin to prevent local DOM access to parent (Module 101)
      className="w-full h-full border-0 bg-[#1b1b1c]"
    />
  );
}
