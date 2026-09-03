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
| Invoice Register    | 5 of 5     | — (2 rebuilt)      |
| Receipts (Money In) | 0 of 6     | ₹5,73,075          |
| Expenses            | 6 of 37    | ₹1,33,899          |
| Payouts             | 0 of 11    | ₹4,46,848          |

Undocumented value is per register and does not sum across them — an invoice and
the receipt that settles it are the same money seen twice.

## Invoices rebuilt

Two invoices existed only as tracker rows: no PDF in Drive, no copy in Gmail, and
no matching Claude artifact. Both were reconstructed from primary sources and
filed under `2026-08 Aug/02 Invoices/`.

| Invoice               | Date      | Client       | Value      | Rebuilt from                                          |
| --------------------- | --------- | ------------ | ---------- | ----------------------------------------------------- |
| `LVPL/INV/2026-27/003` | 13-Aug-26 | Baxy Limited | ₹3,54,000  | PO 2300007575, SOW milestone 3 terms, tracker figures |
| `LVPL/PI/2026-27/003`  | 04-Aug-26 | Acer (T) Ltd | USD 116.00 | ICICI inward-remittance advice, SOW of 22 Jul 2026    |

The Acer advice also supplied the registered address, the NCBA Tanzania
originating bank and purpose code P0802. Both PDFs still need signature and
stamp, and the Baxy one should be reconciled against the copy Baxy holds.

`scripts/` is not used for these — the generator lived in the session scratchpad,
since a reconstruction is a one-off, not a recurring job.

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
