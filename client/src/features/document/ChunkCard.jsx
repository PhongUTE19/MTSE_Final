import React, { useState } from 'react';
import { UI_LABELS } from '../../shared/constants';
import Button from '../../primitives/buttons/Button.jsx';
import Badge from '../../primitives/labels/Badge.jsx';
import Inline from '../../primitives/layout/Inline.jsx';
import { Card, CardHeader, CardTitle, CardContent } from '../../primitives/cards/index.js';
import Text from '../../primitives/typography/Text.jsx';

export default function ChunkCard({ chunk }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card>
      <CardHeader>
        <Inline justify="between" align="start" fullWidth>
          <Inline gap="xs" align="center">
            <Badge>{chunk.id}</Badge>
            <Badge>{chunk.source}</Badge>
            <CardTitle as="h4">{chunk.title}</CardTitle>
          </Inline>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? UI_LABELS.COMMON.COLLAPSE : UI_LABELS.COMMON.EXPAND}
          </Button>
        </Inline>
      </CardHeader>
      <CardContent>
        <Text
          variant="secondary"
          preserveWhitespace
          clamp={isExpanded ? undefined : 2}
        >
          {chunk.content}
        </Text>
      </CardContent>
    </Card>
  );
}
