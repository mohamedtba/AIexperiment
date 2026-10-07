import 'server-only';

import PDFDocument from 'pdfkit';
import { getDictionary } from '@/i18n';
import { formatDateTimeFr } from '@/lib/utils';
import { toStudentGroup, type StudentGroup } from '@/types';

const t = getDictionary();

const MARGIN = 56;

export interface CreatedAccountPdf {
  username: string;
  password: string;
  group: StudentGroup;
}

/** PDF handout of the accounts just created: username + password + group. */
export async function buildCredentialsPdf(accounts: CreatedAccountPdf[]): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    info: { Title: `Identifiants — ${t.common.appName}`, Author: t.common.appName },
  });

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.font('Helvetica-Bold').fontSize(20).fillColor('#1c1917');
  doc.text(t.common.appName);
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(11).fillColor('#78716c');
  doc.text(`${t.common.appTagline} · ${formatDateTimeFr(new Date())}`);
  doc.moveDown(1);

  doc.font('Helvetica-Bold').fontSize(13).fillColor('#1c1917');
  doc.text(`Identifiants générés (${accounts.length})`);
  doc.moveDown(0.6);

  doc.font('Courier-Bold').fontSize(9).fillColor('#78716c');
  doc.text(`IDENTIFIANT        MOT DE PASSE        GROUPE`);
  doc.moveDown(0.3);

  for (const account of accounts) {
    doc.font('Courier').fontSize(11).fillColor('#1c1917');
    doc.text(
      `${account.username.padEnd(19)}${account.password.padEnd(19)}${t.groups[toStudentGroup(account.group)]}`,
      { continued: false },
    );
    doc.moveDown(0.35);
    if (doc.y > doc.page.height - MARGIN - 40) doc.addPage();
  }

  doc.end();
  return done;
}
