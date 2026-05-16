export interface VideoGameDescriptionInput {
  readonly title: string;
  readonly platform: string | null;
  readonly genre: string | null;
  readonly publisher: string | null;
  readonly esrbRating: string | null;
  readonly releaseYear: string | null;
  readonly condition: 'NEW' | 'USED';
  readonly sku: string;
}

export function buildVideoGameHtmlDescription(input: VideoGameDescriptionInput): string {
  const title = input.title.trim() || "Video Game";
  const rows: string[] = [];

  const addRow = (label: string, value: string | null) => {
    if (value && value.trim()) {
      rows.push(`
      <tr>
        <td style="width:30%;font-weight:bold;padding:8px;background-color:#f4f4f4;border:1px solid #ddd;">${label}</td>
        <td style="padding:8px;border:1px solid #ddd;">${value.trim()}</td>
      </tr>`);
    }
  };

  addRow("Platform", input.platform);
  addRow("Genre", input.genre);
  addRow("Publisher", input.publisher);
  addRow("ESRB Rating", input.esrbRating);
  addRow("Release Year", input.releaseYear);

  // Always include Condition
  const conditionDisplay = input.condition === "NEW" ? "New" : "Used - Good";
  rows.push(`
      <tr>
        <td style="width:30%;font-weight:bold;padding:8px;background-color:#f4f4f4;border:1px solid #ddd;">Condition</td>
        <td style="padding:8px;border:1px solid #ddd;">${conditionDisplay}</td>
      </tr>`);

  return `
<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#222;">
  <h2 style="font-size:20px;margin-bottom:8px;">${title}</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    ${rows.join("")}
  </table>
  <p style="font-size:12px;color:#666;margin-top:16px;">
    Ships in original case. Disc and case condition as described. 
    All used games are tested and working. SKU: ${input.sku}
  </p>
</div>`.trim();
}
