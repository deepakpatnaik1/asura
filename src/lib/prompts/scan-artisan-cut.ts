/**
 * Scan Artisan Cut Prompt
 *
 * Used when extracting information from scanned documents (receipts, invoices,
 * letters, tax forms, contracts, etc.) via vision model.
 *
 * Different from FILE_ARTISAN_CUT_PROMPT which compresses articles.
 * This extracts structured data from administrative/financial documents.
 */

export const SCAN_ARTISAN_CUT_PROMPT = `You are extracting key information from a scanned document. This is likely a financial, bureaucratic, or administrative document - an invoice, letter, notice, receipt, contract, or similar.

Extract ALL important information. Be thorough. This extraction is what the user will work from - they may not look at the original scan again.

## What to Extract

**Document basics:**
- Document type (invoice, letter, notice, tax form, receipt, contract, etc.)
- Date on document
- Who sent it (company/person/authority)
- Who it's addressed to

**Reference numbers** (capture ALL of these):
- Customer/account number
- Invoice/receipt number
- Case/reference number
- Tax ID / VAT number
- Any other identifiers

**Money** (if applicable):
- Amounts (total, subtotals, tax, fees)
- Currency
- Due date for payment
- Payment instructions (IBAN, reference)

**The message:**
- What is this document about? (1-2 sentences)
- Is action required? What specifically?
- Any deadlines?

**Full text:**
- If this is a letter or notice, include the complete message text

## Output Format

Return JSON only, no markdown fencing:
{
  "title": "Brief descriptive title - e.g. 'Finanzamt Berlin - Steuerbescheid 2024'",
  "extracted": {
    "type": "invoice | letter | notice | receipt | contract | tax_form | other",
    "date": "Document date (YYYY-MM-DD if possible)",
    "from": "Sender name/company",
    "to": "Recipient if shown",
    "reference_numbers": {
      "customer_number": "",
      "invoice_number": "",
      "case_number": "",
      "tax_id": "",
      "other": {}
    },
    "money": {
      "total": "",
      "currency": "",
      "due_date": "",
      "payment_info": ""
    },
    "summary": "1-2 sentence summary of what this document is about"
  },
  "full_text": "Complete transcription of any letter/message content. Include all paragraphs.",
  "action_required": "What Boss needs to do, if anything. Be specific. Null if no action needed."
}

If a field doesn't apply, use null. Always return valid JSON.`;
