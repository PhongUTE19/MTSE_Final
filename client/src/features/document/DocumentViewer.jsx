import React from 'react';
import Button from '../../primitives/buttons/Button.jsx';
import { Inline } from '../../primitives/layout/index.js';
import { Card, CardHeader, CardTitle, CardContent } from '../../primitives/cards/index.js';

/**
 * Read-only viewer for inspecting canonical Knowledge Base Markdown documents.
 */
export default function DocumentViewer({ viewingDoc, onClose }) {
  if (!viewingDoc) return null;

  return (
    <Card variant="outlined" padding="lg">
      <CardHeader>
        <Inline justify="between" align="center" fullWidth>
          <CardTitle as="h3">{viewingDoc.filename}</CardTitle>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </Inline>
      </CardHeader>
      <CardContent>
        <pre className="whitespace-pre-wrap break-words font-mono text-xs text-content-secondary bg-surface-muted p-4 rounded-md border border-border max-h-96 overflow-y-auto">
          {viewingDoc.content}
        </pre>
      </CardContent>
    </Card>
  );
}
