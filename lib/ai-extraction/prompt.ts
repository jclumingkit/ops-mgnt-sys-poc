export const buildExtractionPrompt = (notes: string) => `Extract a structured record from the call notes below.

Return exactly one JSON object with exactly these four properties:
- parent_name: the explicitly stated parent's name; preserve only the portion supplied if a full name is not present.
- child_name: the explicitly stated child's name; preserve only the portion supplied if a full name is not present.
- payer: the explicitly stated insurance payer or carrier.
- follow_up_date: an explicitly stated follow-up date normalized to YYYY-MM-DD.

Extraction rules:
- Use only facts stated in the call notes. Never guess or infer missing identities, payer details, or dates.
- If a field is not mentioned at all, set its value to exactly "Not defined in call notes".
- If a field is mentioned but the notes are ambiguous or incomplete, set its value to exactly "Insufficient data".
- Keep every property in the JSON object, including fields with either sentinel value.
- Resolve a relative date only when a reliable reference date is provided. Otherwise use "Insufficient data".
- Return only JSON. Do not return Markdown, explanations, confidence scores, reasoning, or additional properties.

Call notes:
<call_notes>
${notes}
</call_notes>`
