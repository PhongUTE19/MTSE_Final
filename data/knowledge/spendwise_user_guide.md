# SpendWise User Guide and Knowledge Base

## 1. About SpendWise
SpendWise is an intelligent personal finance and expense management platform designed to help users track spending, scan receipts with multimodal AI, and query documentation using retrieval-augmented generation (RAG).

## 2. Platform Features at a Glance
SpendWise provides core capabilities across personal finance and administrative oversight:

| Feature | Manual Transaction | Receipt Scan Draft |
|---|---|---|
| Creation Method | Form or AI Assistant | Camera / Image Upload |
| Supported Types | Income and Expense | Expense |
| Maximum Attachment Size | N/A | 5 MB |
| Processing Status | Instant | OCR Review Required |
| Multi-item Breakdown | Optional item list | Extracted line items |

## 3. Personal Expense Tracking
Users can record income and expense transactions with amount, date, category, merchant or description, and optional notes. Every transaction is authenticated and scoped to the user account with row-level security.

## 4. Transaction Categories and Filtering
Supported transaction categories include Food & Dining, Transportation, Utilities, Entertainment, Healthcare, Shopping, Income, and General. The transaction ledger supports instant filtering by date range, type, category, and keyword search.

## 5. Receipt Scanning and OCR Review
Receipt images in JPG, PNG, or WebP format up to 5 MB can be uploaded for automated OCR processing. The extracted merchant, total amount, date, and line items are staged as review drafts before permanent confirmation.

## 6. AI Expense Assistant
The floating AI Expense Assistant enables natural language interactions. Users can search recent transactions, compute spending summaries by period, or prepare new transaction proposals with review safeguards.

## 7. Knowledge Base Management
Administrators can upload and manage Markdown documentation. Documents are parsed by level-2 section headers into searchable chunks and synchronized with the vector database.

## 8. Vector Indexing and Qdrant Search
Documentation chunks are embedded into high-dimensional vectors and stored in Qdrant Cloud. Cosine similarity matching retrieves the most relevant context to ground assistant answers.

## 9. AI Usage Analytics and Observability
The administrative dashboard provides live observability across AI generations, tracking request volume, outcome breakdowns, token utilization, and latency percentiles.

## 10. Authentication and Security Architecture
Authentication is powered by Supabase Auth with Bearer JWT verification on every protected endpoint. Administrative privileges are strictly governed by verified app_metadata role claims.

## 11. System Configuration and Limits
Receipt uploads are limited to 5 MB per file. Rate limiters protect API endpoints, chat completions, and OCR processing against overload while preserving responsive performance.

## 12. Frequently Asked Questions
Answers to common questions regarding session restoration, password recovery, data export, vector re-indexing, and account management.
