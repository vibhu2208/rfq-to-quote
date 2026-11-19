export type TemplateVars = {
  name?: string;
  company?: string;
  phone?: string;
  email?: string;
};

const VAR_RE = /\{\{\s*(name|company|phone|email)\s*\}\}/gi;

export function renderCampaignMessage(template: string, vars: TemplateVars) {
  return template.replace(VAR_RE, (_, key: string) => {
    const k = key.toLowerCase() as keyof TemplateVars;
    return vars[k]?.trim() || "";
  });
}

export const CAMPAIGN_TEMPLATE_HINT =
  "Use {{name}}, {{company}}, {{phone}}, {{email}} for personalization.";