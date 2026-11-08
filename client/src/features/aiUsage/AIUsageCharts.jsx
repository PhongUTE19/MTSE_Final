import React from 'react';
import { UI_LABELS } from '../../shared/constants';
import { Card, CardHeader, CardTitle, CardContent } from '../../primitives/cards/index.js';
import { Grid } from '../../primitives/layout/index.js';
import RequestVolumeChart from './RequestVolumeChart.jsx';
import TokenTrendChart from './TokenTrendChart.jsx';
import BreakdownList from './BreakdownList.jsx';

export default function AIUsageCharts({ timeseries = [], breakdown = {}, loading = false }) {
  return (
    <Grid as="section" columns={2} gap="md" role="region" aria-label="AI usage charts">
      <Card variant="outlined" padding="lg">
        <CardHeader>
          <CardTitle as="h4">{UI_LABELS.ANALYTICS.CHARTS.VOLUME_TREND}</CardTitle>
        </CardHeader>
        <CardContent>
          <RequestVolumeChart data={timeseries} loading={loading} />
        </CardContent>
      </Card>

      <Card variant="outlined" padding="lg">
        <CardHeader>
          <CardTitle as="h4">{UI_LABELS.ANALYTICS.CHARTS.TOKEN_TREND}</CardTitle>
        </CardHeader>
        <CardContent>
          <TokenTrendChart data={timeseries} loading={loading} />
        </CardContent>
      </Card>

      <Card variant="outlined" padding="lg">
        <CardHeader>
          <CardTitle as="h4">{UI_LABELS.ANALYTICS.CHARTS.FEATURE_BREAKDOWN}</CardTitle>
        </CardHeader>
        <CardContent>
          <BreakdownList items={breakdown?.byFeature} loading={loading} />
        </CardContent>
      </Card>

      <Card variant="outlined" padding="lg">
        <CardHeader>
          <CardTitle as="h4">{UI_LABELS.ANALYTICS.CHARTS.MODEL_BREAKDOWN}</CardTitle>
        </CardHeader>
        <CardContent>
          <BreakdownList items={breakdown?.byModel} loading={loading} />
        </CardContent>
      </Card>
    </Grid>
  );
}
