# 03 — Use Case Diagram

> **Package:** SpendWise Academic Software Requirements Specification (SRS)  
> **Related Documents:** [`01-scope-and-user-roles.md`](./01-scope-and-user-roles.md), [`04-use-case-specifications.md`](./04-use-case-specifications.md)

---

## 1. System Use Case Diagram

The diagram below depicts the implemented SpendWise system boundary, primary human actors (**Guest**, **Authenticated User**, **Administrator**), and core use cases (`UC-001` through `UC-011`). Note that **Administrator** does not inherit **Authenticated User** finance or chat use cases (`BR-002`).

```mermaid
flowchart LR
    Guest(["Guest"])
    User(["Authenticated User"])
    Admin(["Administrator"])

    subgraph SpendWise["SpendWise System Boundary"]
        UC1(["UC-001: Sign In / Sign Up / Reset Password"])
        UC2(["UC-002: Manage Confirmed Transactions"])
        UC3(["UC-003: Search, Filter & Paginate Transactions"])
        UC4(["UC-004: Upload Receipt for Stateless OCR"])
        UC5(["UC-005: Review & Edit Local TransactionDraft"])
        UC6(["UC-006: Confirm Draft to Official Ledger"])
        UC7(["UC-007: Preview Confirmed Receipt Image"])
        UC8(["UC-008: Chat with Unified AI Assistant (SSE)"])
        UC9(["UC-009: Manage Server-Authoritative Chat History"])
        UC10(["UC-010: Monitor AI Usage Analytics"])
        UC11(["UC-011: Inspect Docs & Reindex Knowledge Base"])
    end

    Guest --> UC1
    User --> UC1
    Admin --> UC1

    User --> UC2
    User --> UC3
    User --> UC4
    User --> UC5
    User --> UC6
    User --> UC7
    User --> UC8
    User --> UC9

    UC4 -. "<<extend>>" .-> UC5
    UC5 -. "<<include>>" .-> UC6
    UC8 -. "<<extend>>" .-> UC5
    UC8 -. "<<include>>" .-> UC9

    Admin --> UC10
    Admin --> UC11
```

---

## 2. Relationship Summary

- **UC-004 → UC-005 (`<<extend>>`):** Successful stateless OCR extraction stages a local `TransactionDraft` in browser IndexedDB for review.
- **UC-008 → UC-005 (`<<extend>>`):** When the Unified AI Assistant invokes `propose_transaction`, the client stages an optional `TransactionDraft` card for user review/confirmation.
- **UC-005 → UC-006 (`<<include>>`):** Confirming a reviewed `TransactionDraft` commits it to the official PostgreSQL ledger (and uploads/links receipt storage for receipt drafts).
- **UC-008 → UC-009 (`<<include>>`):** Streaming chat turns (`POST /api/chat-assistant/stream`) register and persist user/assistant turns in server-authoritative Chat History.
