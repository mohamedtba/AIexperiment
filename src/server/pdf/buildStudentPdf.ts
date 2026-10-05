import 'server-only';

import PDFDocument from 'pdfkit';
import { getDictionary } from '@/i18n';
import { formatDateTimeFr } from '@/lib/utils';
import {
  toStudentGroup,
  type AIMessage,
  type Experiment,
  type ExpressionVersion,
  type StudentPublic,
} from '@/types';

/**
 * Builds the PDF transcript of one student.
 *
 * The document is generated on the server with pdfkit so the teacher gets a real
 * file, not a print dialog. It stays in French and contains only what the
 * teacher already sees on screen: the group, the question, the full AI
 * conversation and every submitted version, in chronological order.
 *
 * The built-in Helvetica font is used on purpose: it is embedded by pdfkit in
 * the PDF standard and covers the French accented characters, so no font file
 * has to be shipped and no download has to happen at runtime.
 */

const t = getDictionary();

/** Right and left margin, in points (A4 is 595 x 842). */
const MARGIN = 56;
const CONTENT_WIDTH = 595 - MARGIN * 2;

const COLORS = {
  text: '#1c1917',
  muted: '#78716c',
  line: '#d6d3d1',
  ai: '#1d4ed8',
  student: '#047857',
  expression: '#0f766e',
};

export interface StudentPdfData {
  student: StudentPublic;
  experiment: Experiment;
  messages: AIMessage[];
  versions: ExpressionVersion[];
}

/** Name of the generated file: readable, and safe on every filesystem. */
export function studentPdfFileName(student: StudentPublic, experiment: Experiment): string {
  const group = toStudentGroup(student.group);
  return `${student.username}_${group}_experience-${experiment.sequence}.pdf`;
}

export async function buildStudentPdf(data: StudentPdfData): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    info: {
      Title: `${t.students.title} ${data.student.username} — ${t.experiments.experimentNumber.replace('{n}', String(data.experiment.sequence))}`,
      Author: t.common.appName,
      Subject: data.experiment.question,
      Creator: t.common.appName,
    },
  });

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  try {
    writeHeader(doc, data);
    writeConversation(doc, data.messages);
    writeVersions(doc, data.versions);
    doc.end();
  } catch (error) {
    // pdfkit throws synchronously on a broken font metric: never leave the
    // caller waiting on a promise that will never settle.
    doc.end();
    throw error;
  }

  return done;
}

/* --------------------------------- header -------------------------------- */

function writeHeader(doc: PDFKit.PDFDocument, data: StudentPdfData): void {
  const { student, experiment } = data;
  const group = toStudentGroup(student.group);

  doc.font('Helvetica-Bold').fontSize(20).fillColor(COLORS.text);
  doc.text(t.common.appName, { continued: false });

  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(11).fillColor(COLORS.muted);
  doc.text(`${t.common.appTagline} · ${formatDateTimeFr(new Date())}`);

  doc.moveDown(1);

  // Identity block.
  const rows: Array<[string, string]> = [
    [t.students.username, student.username],
    [t.students.group, t.groups[group]],
    [t.experiments.currentTitle, t.experiments.experimentNumber.replace('{n}', String(experiment.sequence))],
    [t.experiments.startedAt, formatDateTimeFr(experiment.startedAt)],
  ];

  for (const [label, value] of rows) {
    const y = doc.y;
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.muted).text(label, MARGIN, y, {
      width: 150,
      continued: false,
    });
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(COLORS.text)
      .text(value, MARGIN + 155, y, { width: CONTENT_WIDTH - 155 });
    doc.moveDown(0.25);
  }

  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.muted);
  doc.text(t.admin.experimentQuestion.toUpperCase(), { characterSpacing: 0.6 });
  doc.moveDown(0.2);
  doc.font('Helvetica').fontSize(11).fillColor(COLORS.text);
  doc.text(experiment.question, { width: CONTENT_WIDTH, align: 'left' });

  doc.moveDown(0.8);
  doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_WIDTH, doc.y).lineWidth(1).strokeColor(COLORS.line).stroke();
  doc.moveDown(0.8);
}

/* ------------------------------- conversation ----------------------------- */

function writeConversation(doc: PDFKit.PDFDocument, messages: AIMessage[]): void {
  ensureSpace(doc, 60);
  doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.text);
  doc.text(`${t.students.conversationTitle} (${messages.length})`);
  doc.moveDown(0.6);

  if (messages.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(10).fillColor(COLORS.muted);
    doc.text(t.students.conversationEmpty, { width: CONTENT_WIDTH });
    doc.moveDown(1);
    return;
  }

  for (const message of messages) {
    const fromStudent = message.role === 'student';
    const label = fromStudent
      ? `${t.students.you} · ${formatDateTimeFr(message.createdAt)}`
      : `${t.students.assistant} · ${formatDateTimeFr(message.createdAt)}`;

    writeParagraph(doc, message.content, {
      color: fromStudent ? COLORS.student : COLORS.ai,
      background: fromStudent ? '#f0fdf4' : '#eff6ff',
      label,
      labelColor: fromStudent ? COLORS.student : COLORS.ai,
    });
  }

  doc.moveDown(0.5);
}

/* -------------------------------- versions -------------------------------- */

function writeVersions(doc: PDFKit.PDFDocument, versions: ExpressionVersion[]): void {
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.text);
  doc.text(`${t.students.expressionTitle} (${versions.length})`);
  doc.moveDown(0.6);

  if (versions.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(10).fillColor(COLORS.muted);
    doc.text(t.students.expressionEmpty, { width: CONTENT_WIDTH });
    return;
  }

  for (const version of versions) {
    writeParagraph(doc, version.content, {
      color: COLORS.expression,
      background: '#f0fdfa',
      label: `${t.common.version} ${version.versionNumber} · ${formatDateTimeFr(version.createdAt)}`,
      labelColor: COLORS.expression,
    });
  }
}

/* --------------------------------- layout -------------------------------- */

/**
 * Draws a labelled block of text on a tinted background.
 *
 * pdfkit does not wrap text inside a rectangle, so the height is measured first
 * with a throwaway pass and the background is then painted behind the text.
 * This also guarantees a block is never cut in half by a page break.
 */
function writeParagraph(
  doc: PDFKit.PDFDocument,
  content: string,
  options: {
    label: string;
    color: string;
    labelColor: string;
    background: string;
  },
): void {
  const padding = 8;
  const innerWidth = CONTENT_WIDTH - padding * 2;

  // Measurement pass: same font, same width, no drawing.
  doc.font('Helvetica').fontSize(10);
  const labelHeight = doc.heightOfString(options.label, { width: innerWidth });
  const bodyHeight = doc.heightOfString(content, { width: innerWidth });
  const blockHeight = labelHeight + bodyHeight + padding * 2 + 6;

  ensureSpace(doc, blockHeight);

  const top = doc.y;
  const left = MARGIN;

  doc
    .roundedRect(left, top, CONTENT_WIDTH, blockHeight, 4)
    .fillColor(options.background)
    .fill();

  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(options.labelColor)
    .text(options.label, left + padding, top + padding, { width: innerWidth });

  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(COLORS.text)
    .text(content, left + padding, top + padding + labelHeight + 6, {
      width: innerWidth,
      align: 'left',
    });

  // Park the cursor below the block.
  doc.y = top + blockHeight + 8;
}

/** Starts a new page when less than `needed` points remain. */
function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  if (doc.y + needed <= doc.page.height - MARGIN) return;
  doc.addPage();
}