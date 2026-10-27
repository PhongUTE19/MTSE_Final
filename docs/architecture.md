# SpendWise Architecture & System Documentation

This document serves as the top-level index for the SpendWise architecture and detailed AI implementation flows.

---

## 1. High-Level Architecture

For the overall multi-service system design, component breakdown, Docker deployment, and Architecture Decision Records (ADRs), see:
* **[SpendWise System Architecture](README/architecture.md)**
* **[Architecture Decision Records (ADRs)](README/adr/)**

---

## 2. Source-Traceable AI Architecture & Data Flows

Detailed implementation-level documentation explaining the real execution flows through current source code (with exact file paths, line numbers, prompt files, tool schemas, guardrails, and tests) is organized in `docs/ai-data-flows/`:

1. **[AI Architecture & Flow Overview](ai-data-flows/README.md)**
   System-level architecture diagram, flow map, capability classification, and source traceability standard.

2. **[Flow 01: Multimodal Receipt Scanning & Structured Extraction](ai-data-flows/01-receipt-multimodal.md)**
   End-to-end receipt pipeline from file picker to database write, prompt resolution, Zod normalization, subtotal guardrails, and Nginx reverse-proxy configuration.

3. **[Flow 02: Tool-Using Expense Agent](ai-data-flows/02-tool-using-agent.md)**
   Conversational assistant, tool declaration inventory (`search_transactions`, `get_spending_summary`, `create_transaction`), proposal lifecycle, and two-phase confirmation security gate.

4. **[Flow 03: RAG & Knowledge Base](ai-data-flows/03-rag-flow.md)**
   Document chunking, Qdrant vector indexing, similarity threshold gate (`0.65`), policy amendment overrides, and grounding prompt construction.

5. **[Flow 04: Admin AI Analytics](ai-data-flows/04-admin-analytics.md)**
   Asynchronous telemetry lifecycle, bounded queue writer, metric provenance table, full-dataset search/sort, and token estimation.

6. **[Flow 05: Prompts, Guardrails & Telemetry Catalogue](ai-data-flows/05-prompts-guardrails-and-telemetry.md)**
   Single source of truth for all 8 prompt files, 16 deterministic guardrails, and platform external dependencies.
