import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const clientSrcDir = path.join(rootDir, 'client/src');
const baseComponentsDir = path.join(clientSrcDir, 'primitives');
const layoutDir = path.join(baseComponentsDir, 'layout');

/**
 * Recursively find all source files in a directory.
 */
function findFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findFiles(fullPath));
    } else if (/\.(jsx|js)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('FRONTEND COMPONENT & LAYOUT STANDARDIZATION SUITE', () => {
  describe('1. Native <button> and <label> Migration', () => {
    it('verifies ConfirmDialog.jsx migrates all buttons to Base Button/IconButton', () => {
      const confirmDialogSource = fs.readFileSync(
        path.join(clientSrcDir, 'composites/overlays/ConfirmDialog.jsx'),
        'utf8'
      );
      assert.doesNotMatch(confirmDialogSource, /<button\b/, 'ConfirmDialog must not contain raw <button>');
      assert.match(confirmDialogSource, /<IconButton\b/, 'ConfirmDialog must use IconButton for close');
      assert.match(confirmDialogSource, /<Button\b/, 'ConfirmDialog must use Button for actions');
      assert.match(confirmDialogSource, /ref=\{cancelButtonRef\}/, 'Cancel button must preserve ref');
      assert.match(confirmDialogSource, /ref=\{confirmButtonRef\}/, 'Confirm button must preserve ref');
      assert.match(confirmDialogSource, /data-testid="confirm-dialog-confirm"/, 'Confirm button must preserve test id');
      assert.match(confirmDialogSource, /data-testid="confirm-dialog-cancel"/, 'Cancel button must preserve test id');
    });

    it('verifies EXACTLY ONE raw <button> tag exists in the entire client codebase (inside Button.jsx)', () => {
      const allFiles = findFiles(clientSrcDir);
      const rawButtonRegex = /<button\b/g;
      const rawButtonsFound = [];

      for (const filePath of allFiles) {
        const relative = path.relative(clientSrcDir, filePath).replace(/\\/g, '/');
        const content = fs.readFileSync(filePath, 'utf8');
        const matches = content.match(rawButtonRegex);
        if (matches) {
          rawButtonsFound.push({ file: relative, count: matches.length });
        }
      }

      assert.deepEqual(
        rawButtonsFound,
        [{ file: 'primitives/buttons/Button.jsx', count: 1 }],
        'Only Button.jsx may contain a native <button> tag'
      );
    });

    it('verifies EXACTLY ONE raw <label> tag exists in the entire client codebase (inside Label.jsx)', () => {
      const allFiles = findFiles(clientSrcDir);
      const rawLabelRegex = /<label\b/g;
      const rawLabelsFound = [];

      for (const filePath of allFiles) {
        const relative = path.relative(clientSrcDir, filePath).replace(/\\/g, '/');
        const content = fs.readFileSync(filePath, 'utf8');
        const matches = content.match(rawLabelRegex);
        if (matches) {
          rawLabelsFound.push({ file: relative, count: matches.length });
        }
      }

      assert.deepEqual(
        rawLabelsFound,
        [{ file: 'primitives/labels/Label.jsx', count: 1 }],
        'Only Label.jsx may contain a native <label> tag'
      );
    });

    it('verifies zero raw <input> tags outside TextInput.jsx and FileInput.jsx', () => {
      const allowedInputFiles = new Set([
        path.normalize(path.join(clientSrcDir, 'primitives/inputs/TextInput.jsx')),
        path.normalize(path.join(clientSrcDir, 'primitives/inputs/FileInput.jsx')),
      ]);

      const allFiles = findFiles(clientSrcDir);
      const violations = [];

      for (const file of allFiles) {
        if (allowedInputFiles.has(path.normalize(file))) continue;

        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');
        lines.forEach((line, index) => {
          if (/<input[\s>]/.test(line)) {
            const relPath = path.relative(rootDir, file).replace(/\\/g, '/');
            violations.push(`${relPath}:${index + 1}: ${line.trim()}`);
          }
        });
      }

      assert.deepEqual(
        violations,
        [],
        `Found unauthorized raw <input> elements in frontend source:\n${violations.join('\n')}`
      );
    });

    it('verifies zero raw <textarea> tags outside TextArea.jsx', () => {
      const allowedTextareaFiles = new Set([
        path.normalize(path.join(clientSrcDir, 'primitives/inputs/TextArea.jsx')),
      ]);

      const allFiles = findFiles(clientSrcDir);
      const violations = [];

      for (const file of allFiles) {
        if (allowedTextareaFiles.has(path.normalize(file))) continue;

        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');
        lines.forEach((line, index) => {
          if (/<textarea[\s>]/.test(line)) {
            const relPath = path.relative(rootDir, file).replace(/\\/g, '/');
            violations.push(`${relPath}:${index + 1}: ${line.trim()}`);
          }
        });
      }

      assert.deepEqual(
        violations,
        [],
        `Found unauthorized raw <textarea> elements in frontend source:\n${violations.join('\n')}`
      );
    });

    it('verifies zero raw <select> tags outside Select.jsx', () => {
      const allowedSelectFiles = new Set([
        path.normalize(path.join(clientSrcDir, 'primitives/inputs/Select.jsx')),
      ]);

      const allFiles = findFiles(clientSrcDir);
      const violations = [];

      for (const file of allFiles) {
        if (allowedSelectFiles.has(path.normalize(file))) continue;

        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');
        lines.forEach((line, index) => {
          if (/<select[\s>]/.test(line)) {
            const relPath = path.relative(rootDir, file).replace(/\\/g, '/');
            violations.push(`${relPath}:${index + 1}: ${line.trim()}`);
          }
        });
      }

      assert.deepEqual(
        violations,
        [],
        `Found unauthorized raw <select> elements in frontend source:\n${violations.join('\n')}`
      );
    });
  });

  describe('2. Base Grid and Layout Primitives Expansion', () => {
    it('verifies Grid.jsx exists with strict prop controls and forwardRef', () => {
      const gridPath = path.join(layoutDir, 'Grid.jsx');
      assert.ok(fs.existsSync(gridPath), 'Grid.jsx must exist');
      const gridSource = fs.readFileSync(gridPath, 'utf8');
      assert.match(gridSource, /forwardRef/, 'Grid must support forwardRef');
      assert.match(gridSource, /fullWidth/, 'Grid must support fullWidth prop');
      assert.match(gridSource, /columns/, 'Grid must support columns prop');
    });

    it('verifies Grid is exported from layout barrel and baseComponents barrel', () => {
      const layoutIndex = fs.readFileSync(path.join(layoutDir, 'index.js'), 'utf8');
      const baseIndex = fs.readFileSync(path.join(baseComponentsDir, 'index.js'), 'utf8');
      assert.match(layoutIndex, /export \{ default as Grid \} from '\.\/Grid\.jsx'/, 'layout barrel must export Grid');
      assert.match(baseIndex, /Grid/, 'baseComponents barrel must export Grid');
    });

    it('verifies Stack and Inline support fullWidth prop', () => {
      const stackSource = fs.readFileSync(path.join(layoutDir, 'Stack.jsx'), 'utf8');
      const inlineSource = fs.readFileSync(path.join(layoutDir, 'Inline.jsx'), 'utf8');
      assert.match(stackSource, /fullWidth = false/, 'Stack must accept fullWidth prop');
      assert.match(stackSource, /fullWidth \? 'w-full/, 'Stack must apply fullWidth utility class');
      assert.match(inlineSource, /fullWidth = false/, 'Inline must accept fullWidth prop');
      assert.match(inlineSource, /fullWidth \? 'w-full'/, 'Inline must apply fullWidth utility class');
    });

    it('verifies Grid.jsx defines column variants and fullWidth classes via Tailwind', () => {
      const gridSource = fs.readFileSync(path.join(layoutDir, 'Grid.jsx'), 'utf8');
      assert.match(gridSource, /grid-cols-1/, 'Must support 1 column');
      assert.match(gridSource, /grid-cols-2/, 'Must support 2 columns');
      assert.match(gridSource, /grid-cols-3/, 'Must support 3 columns');
      assert.match(gridSource, /grid-cols-4/, 'Must support 4 columns');
      assert.match(gridSource, /auto-fit/, 'Must support auto-fit columns');
      assert.match(gridSource, /auto-fill/, 'Must support auto-fill columns');
    });
  });

  describe('3. Targeted Component Refactoring & Removal of Unnecessary Abstractions', () => {
    it('verifies AnalyticsFilterItem.jsx and AnalyticsDetailItem.jsx files are removed (no redundant extractions)', () => {
      const filterItemPath = path.join(clientSrcDir, 'features/analytics/AnalyticsFilterItem.jsx');
      const detailItemPath = path.join(clientSrcDir, 'features/analytics/AnalyticsDetailItem.jsx');
      assert.ok(!fs.existsSync(filterItemPath), 'Redundant AnalyticsFilterItem.jsx file must be removed');
      assert.ok(!fs.existsSync(detailItemPath), 'Redundant AnalyticsDetailItem.jsx file must be removed');
    });

    it('verifies AIUsageFilters composes Stack and Inline directly without redundant abstraction', () => {
      const filtersSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/aiUsage/AIUsageFilters.jsx'),
        'utf8'
      );
      assert.doesNotMatch(filtersSource, /AnalyticsFilterItem/, 'AIUsageFilters must not import AnalyticsFilterItem');
      assert.match(filtersSource, /<Stack gap="xs"/, 'AIUsageFilters must compose Stack directly');
      assert.match(filtersSource, /<Inline\b/, 'AIUsageFilters must compose Inline');
    });

    it('verifies AIUsageHistoryDetailRow has local DetailItem with zero className escape hatch', () => {
      const historyDetailSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/aiUsage/AIUsageHistoryDetailRow.jsx'),
        'utf8'
      );
      assert.match(historyDetailSource, /function AnalyticsDetailItem\(\{ label, children \}\)/, 'Must have local helper with strictly controlled props');
      assert.doesNotMatch(historyDetailSource, /className = ''/, 'Local detail item must not expose className escape hatch');
      assert.match(historyDetailSource, /<Card variant="outlined" padding="sm"/, 'History detail row must compose Card');
      assert.match(historyDetailSource, /<Stack gap="2xs">/, 'History detail row must compose Stack');
      assert.match(historyDetailSource, /<AnalyticsDetailItem\b/, 'History detail row must compose AnalyticsDetailItem');
    });
  });

  describe('4. Standardized Layout and Container Composition Across Specified Files', () => {
    it('verifies AIUsageCharts and AIUsageSummary compose Grid and Inline', () => {
      const chartsSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/aiUsage/AIUsageCharts.jsx'),
        'utf8'
      );
      const chartCanvasSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/aiUsage/BarChartCanvas.jsx'),
        'utf8'
      );
      const kpiSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/aiUsage/AIUsageSummary.jsx'),
        'utf8'
      );
      assert.match(chartsSource, /<Grid as="section" columns=\{2\} gap="md" role="region" aria-label="AI usage charts">/, 'AIUsageCharts must have grid container');
      assert.match(chartCanvasSource, /<Inline gap="md"/, 'BarChartCanvas must compose Inline for legend');
      assert.match(kpiSource, /<Grid\b/, 'AIUsageSummary must compose Grid');
      assert.doesNotMatch(kpiSource, /<div className="stats-grid"/, 'AIUsageSummary must not wrap Grid in stats-grid');
      assert.doesNotMatch(chartsSource, /<Grid[^>]*className=/, 'AIUsageCharts must not pass className to Grid');
      assert.doesNotMatch(kpiSource, /<Grid[^>]*className=/, 'AIUsageSummary must not pass className to Grid');
    });

    it('verifies AuthPage, AuthShowcase, AuthForm, and PasswordField compose Stack and Grid', () => {
      const authSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/auth/AuthPage.jsx'),
        'utf8'
      );
      const showcaseSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/auth/AuthShowcase.jsx'),
        'utf8'
      );
      const formSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/auth/AuthForm.jsx'),
        'utf8'
      );
      const passSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/auth/PasswordField.jsx'),
        'utf8'
      );
      assert.match(showcaseSource, /<Grid columns=\{2\} gap="md">/, 'AuthShowcase must compose Grid');
      assert.match(formSource, /<Stack gap="xs">/, 'AuthForm must compose Stack for fields');
      assert.match(passSource, /<Stack gap="xs">/, 'PasswordField must compose Stack');
      assert.doesNotMatch(passSource, /<div className="auth-field"/, 'PasswordField must not wrap Stack in auth-field');
      assert.doesNotMatch(authSource, /<(Stack|Grid)[^>]*className=/, 'AuthPage must not pass className to Stack or Grid');
      assert.doesNotMatch(passSource, /<Stack[^>]*className=/, 'PasswordField must not pass className to Stack');
    });

    it('verifies Chatbot, ChatConversation, and ChatHistoryTab compose Inline and Stack', () => {
      const chatbotSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/chat/Chatbot.jsx'),
        'utf8'
      );
      const conversationSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/chat/ChatConversation.jsx'),
        'utf8'
      );
      const historyTabSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/chat/ChatHistoryTab.jsx'),
        'utf8'
      );
      const historyItemSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/chat/ChatHistoryItem.jsx'),
        'utf8'
      );
      assert.match(chatbotSource, /<Inline gap="xs" align="center">/, 'Chatbot must compose Inline for header actions');
      assert.match(chatbotSource, /<Inline as="nav" gap="xs" role="tablist">/, 'Chatbot must compose Inline for tabs');
      assert.match(conversationSource, /<Inline gap="xs" wrap justify="center">/, 'ChatConversation must compose Inline for quick actions');
      assert.match(historyTabSource, /<Stack as="div" role="list" gap="xs">/, 'ChatHistoryTab must compose Stack');
      assert.match(historyItemSource, /<Inline justify="between" align="center">/, 'ChatHistoryItem must compose Inline for rows');
      assert.doesNotMatch(chatbotSource, /<(Inline|Stack|Button)[^>]*className=/, 'Chatbot must not pass className to Base Components');
      assert.doesNotMatch(historyTabSource, /<(Inline|Stack|Button)[^>]*className=/, 'ChatHistoryTab must not pass className to Base Components');
      assert.doesNotMatch(historyItemSource, /<(Inline|Stack|Button)[^>]*className=/, 'ChatHistoryItem must not pass className to Base Components');
    });

    it('verifies Transaction and ExpenseAssistant components compose Card, Grid, Stack, and Inline', () => {
      const summarySource = fs.readFileSync(
        path.join(clientSrcDir, 'features/transaction/TransactionSummary.jsx'),
        'utf8'
      );
      const txFieldsSource = fs.readFileSync(
        path.join(clientSrcDir, 'composites/transactions/TransactionFields.jsx'),
        'utf8'
      );
      const txFormSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/transaction/ManualEntry.jsx'),
        'utf8'
      );
      const txTableSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/transaction/TransactionTable.jsx'),
        'utf8'
      );
      const txFiltersSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/transaction/TransactionFiltersBar.jsx'),
        'utf8'
      );
      const toolResultSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/expenseAssistant/ExpenseToolResult.jsx'),
        'utf8'
      );
      const toolSummarySource = fs.readFileSync(
        path.join(clientSrcDir, 'features/expenseAssistant/ToolSpendingSummary.jsx'),
        'utf8'
      );
      const proposalSource = fs.readFileSync(
        path.join(clientSrcDir, 'composites/transactions/TransactionDraftReview.jsx'),
        'utf8'
      );
      const txPageSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/transaction/TransactionPage.jsx'),
        'utf8'
      );

      assert.match(summarySource, /<Grid [^>]*columns=\{3\} gap="md"/, 'TransactionSummary must compose Grid');
      assert.match(txFieldsSource, /<Stack gap="2xs">/, 'TransactionFields must compose Stack');
      assert.match(txFormSource, /<Inline justify="between" align="start" fullWidth>/, 'ManualEntry must compose Inline for heading');
      assert.match(txTableSource, /<Inline justify="between" align="center" fullWidth>/, 'TransactionTable must compose Inline for panel heading');
      assert.match(txFiltersSource, /<Stack gap="2xs">/, 'TransactionFiltersBar must compose Stack for filter fields');
      assert.match(toolSummarySource, /<Inline justify="between" align="center" fullWidth>/, 'ToolSpendingSummary must compose Inline');
      assert.match(toolSummarySource, /<Grid columns=\{3\} gap="sm">/, 'ToolSpendingSummary must compose Grid');
      assert.match(proposalSource, /<Stack gap="md">/, 'TransactionDraftReview must compose Stack');
      assert.match(txPageSource, /<Stack gap="lg">/, 'TransactionPage must compose Stack');

      [summarySource, txFieldsSource, txFormSource, txTableSource, txFiltersSource, toolResultSource, toolSummarySource, proposalSource, txPageSource].forEach(src => {
        assert.doesNotMatch(src, /<(Stack|Inline|Grid|Button)[^>]*className=/, 'Transaction components must not pass className to Base Components');
      });
    });

    it('verifies HomePage, KnowledgeBaseSummary, Receipts, and ConfirmDialog compose standard primitives', () => {
      const homeSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/home/HomePage.jsx'),
        'utf8'
      );
      const kbStatsSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/knowledgeBase/KnowledgeBaseSummary.jsx'),
        'utf8'
      );
      const reviewSource = fs.readFileSync(
        path.join(clientSrcDir, 'composites/transactions/TransactionDraftReview.jsx'),
        'utf8'
      );
      const receiptsViewSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/receipt/ScanReceiptPage.jsx'),
        'utf8'
      );
      const receiptUploadCardSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/receipt/ReceiptUploadCard.jsx'),
        'utf8'
      );
      const sidebarSource = fs.readFileSync(
        path.join(clientSrcDir, 'layouts/WorkspaceSidebar.jsx'),
        'utf8'
      );
      const confirmDialogSource = fs.readFileSync(
        path.join(clientSrcDir, 'composites/overlays/ConfirmDialog.jsx'),
        'utf8'
      );

      assert.match(homeSource, /<Stack gap="xl">/, 'HomePage must compose Stack');
      assert.match(homeSource, /<Card as="section" variant="glass" padding="lg"/, 'HomePage hero must compose Card');
      assert.match(homeSource, /<Inline justify="between" align="center" wrap/, 'HomePage must compose Inline');
      assert.match(kbStatsSource, /<Grid columns=\{4\} gap="md"/, 'KnowledgeBaseSummary must compose Grid');
      assert.doesNotMatch(kbStatsSource, /<div className="stats-grid"/, 'KnowledgeBaseSummary must not wrap Grid in stats-grid');
      assert.match(reviewSource, /<Inline justify="between" align="start" fullWidth>/, 'TransactionDraftReview must compose Inline');
      assert.match(reviewSource, /<Grid columns=\{2\} gap="md">/, 'TransactionDraftReview must compose Grid');
      assert.match(receiptUploadCardSource, /<Card as="section" variant="outlined" padding="md"/, 'ReceiptUploadCard must compose Card');
      assert.match(sidebarSource, /<Inline gap="sm" align="center">/, 'AppSidebar must compose Inline for brand');
      assert.match(sidebarSource, /<Inline gap="sm" align="center">/, 'AppSidebar must compose Inline for user');
      assert.match(confirmDialogSource, /<Inline gap="sm" align="center">/, 'ConfirmDialog must compose Inline for title group');
      assert.match(confirmDialogSource, /<Inline gap="sm" justify="end">/, 'ConfirmDialog must compose Inline for actions');

      [homeSource, kbStatsSource, reviewSource, receiptsViewSource, receiptUploadCardSource, sidebarSource, confirmDialogSource].forEach(src => {
        assert.doesNotMatch(src, /<(Stack|Inline|Grid|Button)[^>]*className=/, 'Must not pass className to Base Components');
      });
    });
  });

  describe('5. Targeted Group and Layout Standardization Audit Verifications', () => {
    it('verifies Alert.jsx exists with variant and role resolution and is properly exported', () => {
      const alertPath = path.join(clientSrcDir, 'composites/feedback/Alert.jsx');
      assert.ok(fs.existsSync(alertPath), 'Alert.jsx must exist');
      const alertSource = fs.readFileSync(alertPath, 'utf8');
      assert.match(alertSource, /variant = 'info'/, 'Alert must default to info variant');
      assert.match(alertSource, /VARIANT_CLASSES\[variant\]/, 'Alert must resolve VARIANT_CLASSES');
      assert.match(alertSource, /role=\{resolvedRole\}/, 'Alert must resolve role');
      assert.match(alertSource, /aria-live=\{resolvedAriaLive\}/, 'Alert must resolve aria-live');

      const feedbackIndex = fs.readFileSync(
        path.join(clientSrcDir, 'composites/feedback/index.js'),
        'utf8'
      );
      const compositeIndex = fs.readFileSync(
        path.join(clientSrcDir, 'composites/index.js'),
        'utf8'
      );
      assert.match(feedbackIndex, /export \{ default as Alert \} from '\.\/Alert\.jsx'/, 'feedback barrel must export Alert');
      assert.match(compositeIndex, /Alert/, 'compositeComponents barrel must export Alert');
    });

    it('verifies AuthPage, AuthForm, AuthShowcase, and ResetPasswordPage adopt Alert and layout primitives', () => {
      const authPageSource = fs.readFileSync(path.join(clientSrcDir, 'features/auth/AuthPage.jsx'), 'utf8');
      const formSource = fs.readFileSync(path.join(clientSrcDir, 'features/auth/AuthForm.jsx'), 'utf8');
      const showcaseSource = fs.readFileSync(path.join(clientSrcDir, 'features/auth/AuthShowcase.jsx'), 'utf8');
      const resetSource = fs.readFileSync(path.join(clientSrcDir, 'features/auth/ResetPasswordPage.jsx'), 'utf8');

      assert.match(formSource, /<Alert variant="info"/, 'AuthForm must use Alert for notices');
      assert.doesNotMatch(formSource, /<div className="auth-alert/, 'AuthForm must not use div.auth-alert directly');
      assert.match(showcaseSource, /<Inline gap="sm" align="center">/, 'AuthShowcase brand must use Inline');
      assert.match(showcaseSource, /<Stack gap="md">/, 'AuthShowcase content must use Stack');
      assert.match(formSource, /<Stack gap="md">/, 'AuthForm card must use Stack');
      assert.match(authPageSource, /<(?:CardHeader|Header) as="header">\s*<Stack gap="xs">/, 'AuthPage card header must use Header and Stack');
      assert.match(formSource, /<Inline justify="end">/, 'AuthForm forgot password must use Inline');

      assert.match(resetSource, /<Alert variant="error"/, 'ResetPasswordPage must use Alert for error');
      assert.match(resetSource, /<Alert variant="info"/, 'ResetPasswordPage must use Alert for message');
      assert.doesNotMatch(resetSource, /<div className="auth-alert/, 'ResetPasswordPage must not use div.auth-alert directly');
      assert.match(resetSource, /<Stack as="section" gap="lg">/, 'ResetPasswordPage must compose Stack for auth-card');
    });

    it('verifies AIUsageHistoryTable and ChatHistoryTab use EmptyState directly without redundant classes', () => {
      const historyTableSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/aiUsage/AIUsageHistoryTable.jsx'),
        'utf8'
      );
      const chatHistorySource = fs.readFileSync(
        path.join(clientSrcDir, 'features/chat/ChatHistoryTab.jsx'),
        'utf8'
      );

      assert.doesNotMatch(historyTableSource, /analytics-empty-search/, 'AIUsageHistoryTable must eliminate analytics-empty-search');
      assert.match(historyTableSource, /<EmptyState\b[\s\S]*?message=\{[\s\S]*?actions=\{/, 'AIUsageHistoryTable must pass message and actions directly to EmptyState');

      assert.doesNotMatch(chatHistorySource, /ai-history--empty/, 'ChatHistoryTab must eliminate ai-history--empty');
      assert.match(chatHistorySource, /<EmptyState message=\{emptyLabel\} \/>/, 'ChatHistoryTab must compose EmptyState');
    });

    it('verifies DocumentTable and TransactionDraftReview eliminate redundant wrapper elements', () => {
      const docTableSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/document/DocumentTable.jsx'),
        'utf8'
      );
      const proposalSource = fs.readFileSync(
        path.join(clientSrcDir, 'composites/transactions/TransactionDraftReview.jsx'),
        'utf8'
      );

      assert.doesNotMatch(docTableSource, /table-pagination-wrapper/, 'DocumentTable must eliminate table-pagination-wrapper');
      assert.match(docTableSource, /<Pagination\b/, 'Pagination must be a direct child in DocumentTable');

      assert.doesNotMatch(proposalSource, /agent-proposal-container/, 'TransactionDraftReview must eliminate agent-proposal-container');
      assert.match(proposalSource, /<Card as="section" variant="glass"/, 'TransactionDraftReview must render Card directly');
    });

    it('verifies TransactionFiltersBar composes Inline for filter toolbars', () => {
      const txFiltersSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/transaction/TransactionFiltersBar.jsx'),
        'utf8'
      );

      assert.match(txFiltersSource, /<Inline\b/, 'TransactionFiltersBar must define filters container using Inline');
      assert.match(txFiltersSource, /<Inline align="center">/, 'TransactionFiltersBar must compose Inline for filter-actions');
    });

    it('verifies ConfirmDialog and EmptyState standardize headers and internal actions', () => {
      const confirmDialogSource = fs.readFileSync(
        path.join(clientSrcDir, 'composites/overlays/ConfirmDialog.jsx'),
        'utf8'
      );
      const emptyStateSource = fs.readFileSync(
        path.join(clientSrcDir, 'composites/dataDisplay/EmptyState.jsx'),
        'utf8'
      );

      assert.match(
        confirmDialogSource,
        /<(?:CardHeader|header)[^>]*>\s*<Inline justify="between" align="start" fullWidth>/,
        'ConfirmDialog must compose Inline for header'
      );
      assert.match(
        emptyStateSource,
        /<Inline justify="center" gap="sm">/,
        'EmptyState must compose Inline for actions'
      );
    });

    it('verifies AIUsagePage and KnowledgeBasePage compose Stack for dashboard containers', () => {
      const analyticsSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/aiUsage/AIUsagePage.jsx'),
        'utf8'
      );
      const kbSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/knowledgeBase/KnowledgeBasePage.jsx'),
        'utf8'
      );

      assert.match(
        analyticsSource,
        /<Stack gap="lg">/,
        'AnalyticsPage must compose Stack for dashboard-container'
      );
      assert.doesNotMatch(
        analyticsSource,
        /inner-dashboard-container/,
        'AnalyticsPage must not contain inner-dashboard-container'
      );
      assert.match(
        kbSource,
        /<Stack gap="lg">/,
        'KnowledgeBasePage must compose Stack for dashboard-container'
      );
    });
  });

  describe('6. Final Layout Wrapper, Button Styling, and Overlay Standardization', () => {
    it('verifies Backdrop base component and ConfirmDialog overlay exist and are exported from barrels', () => {
      const backdropPath = path.join(
        clientSrcDir,
        'primitives/Backdrop.jsx'
      );
      assert.ok(fs.existsSync(backdropPath), 'Backdrop.jsx must exist');
      const backdropSource = fs.readFileSync(backdropPath, 'utf8');
      assert.match(backdropSource, /event\.target === event\.currentTarget/, 'Backdrop must check currentTarget');
      assert.match(backdropSource, /role=\{children \? 'presentation' : undefined\}/, 'Backdrop must declare presentation role for container');

      const overlaysIndex = fs.readFileSync(
        path.join(clientSrcDir, 'composites/overlays/index.js'),
        'utf8'
      );
      const compositeIndex = fs.readFileSync(
        path.join(clientSrcDir, 'composites/index.js'),
        'utf8'
      );
      assert.match(overlaysIndex, /export \{ default as ConfirmDialog \} from '\.\/ConfirmDialog\.jsx'/, 'overlays index must export ConfirmDialog');
      assert.match(compositeIndex, /ConfirmDialog/, 'compositeComponents index must export ConfirmDialog');
    });

    it('verifies ManualEntry and ConfirmDialog compose Backdrop', () => {
      const txFormSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/transaction/ManualEntry.jsx'),
        'utf8'
      );
      const confirmDialogSource = fs.readFileSync(
        path.join(clientSrcDir, 'composites/overlays/ConfirmDialog.jsx'),
        'utf8'
      );

      assert.match(txFormSource, /import Backdrop from/, 'TransactionForm must import Backdrop');
      assert.match(txFormSource, /<Backdrop\b/, 'TransactionForm must compose Backdrop');
      assert.match(txFormSource, /<Modal\b[\s\S]*?as="form"/, 'TransactionForm must compose Modal surface');
      assert.match(confirmDialogSource, /import Backdrop from/, 'ConfirmDialog must import Backdrop');
      assert.match(confirmDialogSource, /<Backdrop\b/, 'ConfirmDialog must compose Backdrop');
    });

    it('verifies ToastItem and Pagination compose Inline for content and info layouts', () => {
      const toastSource = fs.readFileSync(
        path.join(clientSrcDir, 'composites/feedback/ToastItem.jsx'),
        'utf8'
      );
      const paginationSource = fs.readFileSync(
        path.join(clientSrcDir, 'composites/navigation/Pagination.jsx'),
        'utf8'
      );

      assert.match(
        toastSource,
        /<Inline gap="xs" align="center">/,
        'ToastItem must compose Inline for toast-content'
      );
      assert.match(
        paginationSource,
        /<Inline gap="sm" align="center" wrap>/,
        'Pagination must compose Inline for pagination-info'
      );
    });

    it('verifies OverlayDrawer and PushDrawer compose Inline in their header structures', () => {
      const overlayDrawerSource = fs.readFileSync(
        path.join(clientSrcDir, 'composites/overlays/OverlayDrawer.jsx'),
        'utf8'
      );
      const pushDrawerSource = fs.readFileSync(
        path.join(clientSrcDir, 'composites/overlays/PushDrawer.jsx'),
        'utf8'
      );

      assert.match(
        overlayDrawerSource,
        /<(?:CardHeader|header)[^>]*>\s*<Inline justify="between" align="center" fullWidth>/,
        'OverlayDrawer header must compose Inline'
      );
      assert.match(
        pushDrawerSource,
        /<(?:CardHeader|header)[^>]*>\s*<Inline justify="between" align="center" fullWidth>/,
        'PushDrawer header must compose Inline'
      );
    });

    it('verifies Button styling in Chat feature uses controlled props and eliminates primary-button class', () => {
      const chatbotSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/chat/Chatbot.jsx'),
        'utf8'
      );
      const composerSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/chat/ChatComposer.jsx'),
        'utf8'
      );

      assert.match(chatbotSource, /variant="fab"/, 'Chatbot launcher must declare variant="fab"');
      assert.doesNotMatch(composerSource, /className="primary-button"/, 'ChatComposer submit button must not use className="primary-button"');
    });
  });

  describe('7. CardTitle Base Component, ErrorText Purity & Native Element Refactoring', () => {
    it('verifies CardTitle.jsx exists in baseComponents/cards and is exported cleanly', () => {
      const cardTitlePath = path.join(clientSrcDir, 'primitives/cards/CardTitle.jsx');
      assert.ok(fs.existsSync(cardTitlePath), 'CardTitle.jsx must exist in baseComponents/cards');

      const cardsIndexPath = path.join(clientSrcDir, 'primitives/cards/index.js');
      const cardsIndexSource = fs.readFileSync(cardsIndexPath, 'utf8');
      assert.match(cardsIndexSource, /export \{ default as CardTitle \} from '\.\/CardTitle\.jsx';/);

      const baseIndexPath = path.join(clientSrcDir, 'primitives/index.js');
      const baseIndexSource = fs.readFileSync(baseIndexPath, 'utf8');
      assert.match(baseIndexSource, /export \{ default as CardTitle \} from '\.\/cards\/CardTitle\.jsx';/);

      const cardTitleSource = fs.readFileSync(cardTitlePath, 'utf8');
      assert.match(cardTitleSource, /text-content-primary/, 'CardTitle must render standardized Tailwind typography classes');
      assert.match(cardTitleSource, /as: Component = 'h3'/, 'CardTitle must default to h3 element tag');
      assert.match(cardTitleSource, /className:\s*_strippedClassName/, 'CardTitle must strip styling escape hatches');
    });

    it('verifies CardTitle is consumed by AIUsageCharts, ChunkCard, DocumentEditor, and ConfirmDialog', () => {
      const analyticsChartsSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/aiUsage/AIUsageCharts.jsx'),
        'utf8'
      );
      const chunkCardSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/document/ChunkCard.jsx'),
        'utf8'
      );
      const docViewerSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/document/DocumentViewer.jsx'),
        'utf8'
      );
      const confirmDialogSource = fs.readFileSync(
        path.join(clientSrcDir, 'composites/overlays/ConfirmDialog.jsx'),
        'utf8'
      );

      assert.match(analyticsChartsSource, /<CardTitle as="h4">/, 'AnalyticsCharts must compose CardTitle as h4');
      assert.doesNotMatch(analyticsChartsSource, /<h4 className="card-title">/, 'AnalyticsCharts must not use native h4.card-title');

      assert.match(chunkCardSource, /<CardTitle as="h4">/, 'ChunkCard must compose CardTitle as h4');
      assert.doesNotMatch(chunkCardSource, /<h4 className="card-title">/, 'ChunkCard must not use native h4.card-title');

      assert.match(docViewerSource, /<CardTitle as="h3">/, 'DocumentViewer must compose CardTitle as h3');
      assert.doesNotMatch(docViewerSource, /<h3 className="card-title">/, 'DocumentViewer must not use native h3.card-title');

      assert.match(confirmDialogSource, /<CardTitle id="confirm-dialog-title" as="h3">/, 'ConfirmDialog must compose CardTitle');
      assert.doesNotMatch(confirmDialogSource, /<h3 id="confirm-dialog-title" className="confirm-dialog-title card-title">/, 'ConfirmDialog must not use native h3');
    });

    it('verifies ErrorText does not accept external className and ReceiptReview uses clean ErrorText', () => {
      const errorTextPath = path.join(clientSrcDir, 'primitives/labels/ErrorText.jsx');
      const errorTextSource = fs.readFileSync(errorTextPath, 'utf8');
      assert.doesNotMatch(errorTextSource, /@param\s+\{string\}\s+\[props\.className/, 'ErrorText must not declare props.className in JSDoc');

      const receiptReviewSource = fs.readFileSync(
        path.join(clientSrcDir, 'composites/transactions/TransactionDraftReview.jsx'),
        'utf8'
      );
      assert.match(receiptReviewSource, /<ErrorText as="p">/, 'ReceiptReview must compose clean ErrorText without external className override');
      assert.doesNotMatch(receiptReviewSource, /<ErrorText[^>]*className=/, 'ReceiptReview must not pass className to ErrorText');
    });

    it('verifies RouteLoadingFallback in App.jsx renders full-viewport centered fallback container using Tailwind utilities', () => {
      const appSource = fs.readFileSync(path.join(clientSrcDir, 'app/App.jsx'), 'utf8');
      assert.match(
        appSource,
        /<div className="min-h-dvh flex items-center justify-center p-6">/,
        'RouteLoadingFallback must use centered full-viewport Tailwind container'
      );
      assert.doesNotMatch(appSource, /admin-gate/, 'RouteLoadingFallback must not use obsolete admin-gate class');
      assert.doesNotMatch(appSource, /<Grid[^>]*className=/, 'RouteLoadingFallback must not pass className to Grid');
    });

    it('verifies BreakdownList composes Inline for bar rows', () => {
      const breakdownSource = fs.readFileSync(
        path.join(clientSrcDir, 'features/aiUsage/BreakdownList.jsx'),
        'utf8'
      );
      assert.match(
        breakdownSource,
        /<Inline key=\{item\.name\} gap="sm" align="center" fullWidth>/,
        'BreakdownList must compose Inline for bar-row'
      );
    });
  });

  describe('8. Strict Base Component className Elimination & Regression Protection', () => {
    const baseFiles = [
      { name: 'Button', file: 'primitives/buttons/Button.jsx' },
      { name: 'Stack', file: 'primitives/layout/Stack.jsx' },
      { name: 'Inline', file: 'primitives/layout/Inline.jsx' },
      { name: 'Grid', file: 'primitives/layout/Grid.jsx' },
    ];

    it('verifies Base Components strip className and style from rest props', () => {
      baseFiles.forEach(({ name, file }) => {
        const content = fs.readFileSync(path.join(clientSrcDir, file), 'utf8');
        assert.match(
          content,
          /const \{\s*className:\s*_[^,]+,\s*style:\s*_[^,]+,\s*\.\.\.\s*\w+\s*\}\s*=\s*rest;/,
          `${name} must explicitly strip className and style from rest props`
        );
      });
    });

    it('verifies Base Components do not document className in JSDoc', () => {
      baseFiles.forEach(({ name, file }) => {
        const content = fs.readFileSync(path.join(clientSrcDir, file), 'utf8');
        assert.doesNotMatch(
          content,
          /@param\s+\{[^}]*\}\s+\[?props\.className/,
          `${name} must not document props.className in JSDoc`
        );
      });
    });

    it('verifies zero occurrences of external className on Base Components across all client/src JSX/JS files', () => {
      function walkDir(dir) {
        let results = [];
        const list = fs.readdirSync(dir);
        list.forEach((file) => {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);
          if (stat && stat.isDirectory()) {
            results = results.concat(walkDir(fullPath));
          } else if (file.endsWith('.jsx') || file.endsWith('.js')) {
            results.push(fullPath);
          }
        });
        return results;
      }

      const allFiles = walkDir(clientSrcDir);
      const violations = [];
      const tagRegexes = [
        { tag: 'Button', regex: /<Button\b(?![^>]*\/>)(?=[^>]*\bclassName=)[^>]*>/g },
        { tag: 'Stack', regex: /<Stack\b(?![^>]*\/>)(?=[^>]*\bclassName=)[^>]*>/g },
        { tag: 'Inline', regex: /<Inline\b(?![^>]*\/>)(?=[^>]*\bclassName=)[^>]*>/g },
        { tag: 'Grid', regex: /<Grid\b(?![^>]*\/>)(?=[^>]*\bclassName=)[^>]*>/g },
      ];

      allFiles.forEach((filePath) => {
        const content = fs.readFileSync(filePath, 'utf8');
        tagRegexes.forEach(({ tag, regex }) => {
          const matches = content.match(regex);
          if (matches) {
            matches.forEach((m) => {
              violations.push(`${path.relative(clientSrcDir, filePath)}: ${m.trim()}`);
            });
          }
        });
      });

      assert.strictEqual(
        violations.length,
        0,
        `Found ${violations.length} violations where Base Components were passed className:\n${violations.join('\n')}`
      );
    });
  });

  describe('9. Unidirectional Layer Architecture & Tailwind Design Token Integrity', () => {
    it('verifies 6-layer unidirectional import boundaries: primitives and composites never import upper layers', () => {
      const primitivesDir = path.join(clientSrcDir, 'primitives');
      const compositesDir = path.join(clientSrcDir, 'composites');

      const primFiles = findFiles(primitivesDir);
      const compFiles = findFiles(compositesDir);

      const primViolations = [];
      for (const file of primFiles) {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (/(?:from\s+|import\s*\()['"][^'"]*\/(composites|features|layouts|app)\//.test(line)) {
            primViolations.push(`${path.relative(rootDir, file)}:${idx + 1}: ${line.trim()}`);
          }
        });
      }

      assert.deepEqual(
        primViolations,
        [],
        `primitives must never import from composites, features, layouts, or app:\n${primViolations.join('\n')}`
      );

      const compViolations = [];
      for (const file of compFiles) {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (/(?:from\s+|import\s*\()['"][^'"]*\/(features|layouts|app)\//.test(line)) {
            compViolations.push(`${path.relative(rootDir, file)}:${idx + 1}: ${line.trim()}`);
          }
        });
      }

      assert.deepEqual(
        compViolations,
        [],
        `composites must never import from features, layouts, or app:\n${compViolations.join('\n')}`
      );
    });

    it('verifies client/src/index.css is the sole CSS file in client/src/ and contains no @import statements', () => {
      function findCssFiles(dir) {
        let results = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            results = results.concat(findCssFiles(fullPath));
          } else if (entry.name.endsWith('.css')) {
            results.push(path.relative(rootDir, fullPath).replace(/\\/g, '/'));
          }
        }
        return results;
      }

      const cssFiles = findCssFiles(clientSrcDir);
      assert.deepEqual(cssFiles, ['client/src/index.css'], 'index.css must be the sole CSS file in client/src/');

      const indexCss = fs.readFileSync(path.join(clientSrcDir, 'index.css'), 'utf8');
      assert.doesNotMatch(indexCss, /@import\s+['"].*?['"];/, 'index.css must not contain any @import statements');
      assert.match(indexCss, /@tailwind base;/);
      assert.match(indexCss, /@tailwind components;/);
      assert.match(indexCss, /@tailwind utilities;/);
      assert.match(indexCss, /:root\s*\{/);
      assert.match(indexCss, /@layer base\s*\{/);
    });

    it('verifies client/tailwind.config.js defines canonical design token scales', () => {
      const tailwindConfig = fs.readFileSync(path.join(rootDir, 'client/tailwind.config.js'), 'utf8');
      assert.match(tailwindConfig, /screens:\s*\{/);
      assert.match(tailwindConfig, /brand:\s*\{/);
      assert.match(tailwindConfig, /surface:\s*\{/);
      assert.match(tailwindConfig, /border:\s*\{/);
      assert.match(tailwindConfig, /spacing:\s*\{/);
      assert.match(tailwindConfig, /width:\s*\{/);
      assert.match(tailwindConfig, /boxShadow:\s*\{/);
      assert.match(tailwindConfig, /zIndex:\s*\{/);
    });

    it('guarantees zero undefined CSS custom properties across the client codebase', () => {
      const indexCss = fs.readFileSync(path.join(clientSrcDir, 'index.css'), 'utf8');
      const definedTokens = new Set();
      const defRegex = /--[a-zA-Z0-9_-]+(?=\s*:)/g;
      let m;
      while ((m = defRegex.exec(indexCss)) !== null) {
        definedTokens.add(m[0]);
      }

      const allFiles = findFiles(clientSrcDir);
      const missingTokens = new Set();

      allFiles.forEach((file) => {
        const content = fs.readFileSync(file, 'utf8');
        const varRegex = /var\(\s*(--[a-zA-Z0-9_-]+)/g;
        let match;
        while ((match = varRegex.exec(content)) !== null) {
          const token = match[1];
          if (!definedTokens.has(token)) {
            missingTokens.add(token);
          }
        }
      });

      assert.deepEqual(Array.from(missingTokens), [], 'There must be zero undefined CSS tokens referenced');
    });
  });
});
