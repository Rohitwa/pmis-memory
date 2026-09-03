# Finance Tracker v2 — proof-of-document audit

Audit of the `Finance_Tracker v2` Google Sheet, run 3 Sep 2026 against the sheet
as it stood on 2 Sep 2026.

`finance-tracker-v2-proof-audit.html` is the full report: coverage per register,
the per-row list of entries with no supporting document and what to fetch for
each, 11 corrections to make in the sheet, and the new Drive filing structure.

## Coverage found

| Register            | Documented | Undocumented value |
| ------------------- | ---------- | ------------------ |
| PO Register         | 2 of 2     | —                  |
| Invoice Register    | 3 of 5     | ₹3,65,076          |
| Receipts (Money In) | 0 of 6     | ₹5,73,075          |
| Expenses            | 6 of 37    | ₹1,33,899          |
| Payouts             | 0 of 11    | ₹4,46,848          |

Undocumented value is per register and does not sum across them — an invoice and
the receipt that settles it are the same money seen twice.

## Drive filing convention

`Finance Tracker Bills` was reorganised from a flat folder into month, then entry
type. The month is the month the **entry** is dated, not the month the file was
uploaded.

```
<YYYY-MM Mon>/
  01 POs/
  02 Invoices/
    _Superseded/
  03 Receipts (Money In)/
  04 Expenses/
  05 Payouts/
```

Filenames follow:

```
<YYYY-MM-DD>_<Type>_<Party>_<Reference>[_<Amount>][_<PaidBy>].<ext>
Type ∈ { PO, Proforma, TaxInvoice, Receipt, Expense, Payout }
```

Moving or renaming a file in Drive does not change its link, so every existing
`Proof` URL in the sheet still resolves after the reorganisation.

The same convention is written to `_README — filing convention` inside the Drive
folder so it travels with the attachments when the folder is shared.
