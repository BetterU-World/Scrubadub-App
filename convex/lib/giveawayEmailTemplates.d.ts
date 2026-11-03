export interface EmailTemplate {
  id: string; label: string; subject: string; preheader: string; eyebrow: string; title: string;
  paragraphs: string[]; footer: string; note: string; archived?: boolean;
  boxTitle?: string; box?: string; extra?: string;
}
export const emails: EmailTemplate[];
export function render(email: EmailTemplate): string;
