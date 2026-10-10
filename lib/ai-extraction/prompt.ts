export const buildExtractionPrompt = (notes: string) => `Extract one structured record from the call notes.

Return only one valid JSON object containing exactly these four string properties:
- parent_name
- child_name
- payer
- follow_up_date

Field interpretation:
- parent_name: Extract the name explicitly identified as the parent.
  In these call notes, a phrase such as "Spoke with [person] regarding
  child [name]" also identifies [person] as the parent unless the notes
  state a different role or express uncertainty about the relationship.
  Do not treat a named clinician, teacher, insurer representative, or
  other explicitly identified non-parent as the parent.
- child_name: Extract the name identified as the child.
- payer: Extract the stated insurance payer or carrier. Preserve supplied
  abbreviations; do not invent an expanded carrier name.
- follow_up_date: Extract the date identified as the follow-up date and
  normalize it to YYYY-MM-DD.

Decision rules:
- Apply the permitted parent-role interpretation above. Otherwise, use
  only information supported by the notes.
- A first name or other partial name is a valid value. Preserve the
  supplied portion; do not require or invent a surname.
- Use "Not defined in call notes" when no information for a field appears.
- Use "Insufficient data" when relevant information appears but its value
  cannot be resolved, such as conflicting candidate names, an uncertain
  relationship, or an ambiguous date.
- A full ISO date, such as 2027-04-22, is sufficient without a reference date.
- Resolve relative dates only when a reliable reference date is supplied.
  Otherwise use "Insufficient data".
- Evaluate each field independently. An unresolved field must not prevent
  extraction of other fields.
- Include all four properties. Do not include Markdown, explanations,
  reasoning, or additional properties.

Examples:

Notes: Spoke with Elena Ruiz regarding child Mateo. Insurance is UHC.
Requested a speech therapy intake. Follow up on 2027-04-22.
Output: {"parent_name":"Elena Ruiz","child_name":"Mateo","payer":"UHC","follow_up_date":"2027-04-22"}

Notes: Spoke with teacher Marcus Lee regarding child Iris.
Output: {"parent_name":"Not defined in call notes","child_name":"Iris","payer":"Not defined in call notes","follow_up_date":"Not defined in call notes"}

Notes: Parent may be Priya or Devon; relationship is unconfirmed.
Child is Theo. Follow up next Thursday.
Output: {"parent_name":"Insufficient data","child_name":"Theo","payer":"Not defined in call notes","follow_up_date":"Insufficient data"}

Call notes:
<call_notes>
${notes}
</call_notes>`
