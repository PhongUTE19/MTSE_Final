# ADR 0003: Agent Tool Calling and Confirmation Gate for Financial Operations

- **Status:** Accepted and Implemented in Milestone 1
- **Deciders:** SpendWise Engineering Team
- **Date:** 2026-10-25

---

## 1. Context

Personal financial management demands complete numerical precision, trustworthy categorization, and strict user consent before recording or modifying transactions. Standard Large Language Models (LLMs) are prone to arithmetic errors (hallucinating totals), inconsistent date interpretations, and unintentional mutations when prompted conversationally.

Users requested a natural-language assistant to:
1. Search their past transactions using filters (e.g., *"Find all coffee expenses last week"*).
2. Compute spending summaries across arbitrary periods (e.g., *"How much did I spend this month compared to last month?"*).
3. Create new transactions from free-form messages (e.g., *"Spent 65k on lunch at Pho 24 today"*).

The core architectural challenge was designing an agent that feels intuitive while eliminating mathematical hallucination, accidental writes, or security bypasses.

---

## 2. Alternatives Considered

### Alternative 1: Autonomous Multi-Tool Agent with Direct Database Writes
* **Mechanism**: The LLM autonomously chooses tools and directly invokes database insert/update/delete mutations.
* **Pros**: Zero-click convenience for the user.
* **Cons**: High risk of unintended mutations, hallucinated amounts or dates, and vulnerability to prompt injection. A prompt containing *"Delete all transactions"* or misinterpreted money transfers could permanently corrupt ledger records.

### Alternative 2: Pure Text Generation with In-Prompt Data Dump
* **Mechanism**: Fetch all user transactions into the LLM prompt context and let the LLM calculate totals and draft answers.
* **Pros**: Simple architecture without tool-calling configurations.
* **Cons**: LLMs cannot reliably perform arithmetic on large numbers of transactions. Exceeds context window limits as transaction history grows, leaks private data into prompt logs, and wastes significant token cost.

### Alternative 3: Tool-Calling Agent with Proposal-Confirmation Gate & SQL Arithmetic (Selected)
* **Mechanism**:
  * The LLM acts as an orchestrator using function declarations.
  * Read queries execute real database aggregations in SQL (zero LLM math).
  * Write requests generate a transient **Proposal** object in memory/UI; no database record is written until the user explicitly reviews and clicks Confirm.
* **Pros**: 100% calculation accuracy; complete human oversight on ledger mutations; defends against prompt injection; enforces tenant isolation through verified user ID.
* **Cons**: Adds a two-step confirmation interaction in the chat UI.

---

## 3. Decision

The team adopted **Alternative 3: Tool-Calling Agent with Proposal-Confirmation Gate & SQL Arithmetic**.

### 3.1. Function Calling Configuration
Implemented in `server/src/features/expenseAgent/geminiExpenseAgent.js`:
* **Active Model**: `gemini-3.5-flash-lite`.
* **Tool Calling Mode**: Mode `AUTO`. Unlike `ANY` mode which forces a tool execution on every turn, `AUTO` allows the model to respond with natural-language clarification if the user's intent is ambiguous (e.g., asking whether a wallet transfer is an expense or an income).
* **Registered Tools**:
  * `search_transactions`: Filter by date range, merchant, category, type, and pagination limits.
  * `get_spending_summary`: Calculates income, expenses, net savings, and category distributions across an inclusive date range.
  * `create_transaction`: Prepares a transaction proposal.

### 3.2. SQL-Backed Calculations (Zero LLM Math)
* When `get_spending_summary` is called, the backend executes PostgreSQL queries via `server/src/features/expenses/expenses.service.js` (`getSpendingSummary`).
* Totals, counts, and category proportions are calculated by PostgreSQL integer aggregations.
* The returned structured numbers are fed back into Gemini purely for natural-language summarization. The model is forbidden by prompt instructions from inventing or recalculating totals.

### 3.3. Human Confirmation Gate for State Mutations
* In `server/src/features/expenseAgent/expenseAgent.service.js`:
  * When the user asks to add an expense, Gemini calls `create_transaction`, which generates a **Proposal** containing:
    ```json
    {
      "proposalId": "uuid-v4",
      "type": "expense",
      "amount": 65000,
      "category": "Food & Dining",
      "merchant": "Pho 24",
      "date": "2026-10-25",
      "expiresAt": 1792695500000
    }
    ```
  * The proposal is staged and sent to the client. The database state remains unmodified.
  * The client displays an interactive proposal card with **Confirm** and **Cancel** buttons (`client/src/features/expenses/AiExpenseAssistant.jsx`).
  * When confirmed, the client calls `POST /api/assistant/confirm`.
  * The backend verifies proposal expiration, validates ownership, and commits the transaction exactly once (idempotent; replaying the same proposal ID returns an error).

### 3.4. Vietnam Calendar Time Anchor
* To resolve relative dates ("today", "yesterday", "this week", "this month"), the agent injects a deterministic `Today` reference computed via `getVietnamDate()` (`Asia/Ho_Chi_Minh` timezone).
* This prevents bugs where UTC container servers misalign calendar days between 00:00 and 07:00 UTC+7.

---

## 4. Rationale

1. **Financial Integrity**: Financial ledgers require zero tolerance for mathematical errors. Offloading statistical calculations to PostgreSQL guarantees exact precision.
2. **Preventing Accidental Mutations**: A conversational interface must not execute non-reversible side effects without user inspection. The proposal gate guarantees human verification.
3. **Defense-in-Depth**: Prompt injection cannot directly alter database state because tool outputs for mutations are strictly proposals that must be confirmed by the user.

---

## 5. Consequences & Trade-offs

### Positive
* **Guaranteed Mathematical Accuracy**: Financial metrics are 100% accurate because they are computed by PostgreSQL queries rather than generative tokens.
* **High Security & Reversibility**: Users cannot accidentally lose or alter data through prompt misinterpretation or adversarial injection.
* **Idempotency**: Proposal IDs prevent double-submission if the user double-clicks or experiences network retries.
* **Verified by Unit Tests**: Covered by 12 function-calling tests and 9 confirmation lifecycle tests in `tests/unit/expenseAgent.test.js`.

### Trade-offs / Limitations
* **Two-Step Interaction**: Requires the user to click Confirm in the chat UI before the expense appears in the table.
* **In-Memory Proposal Buffer**: Proposals expire after a short time window (10 minutes) and require re-generation if unconfirmed.
