import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib';
import { encryptPDF } from '@pdfsmaller/pdf-encrypt';
import rubricaImg from '@/assets/rubrica.png';

interface DeclarationData {
  studentName: string;
  studentCpf: string | null;
  courseName: string;
  courseCategory: string | null;
  workloadHours: number;
  enrollmentId: string;
  enrolledAt: string;
  lastPaymentDueDate: string | null;
  logoUrl?: string;
}

const OWNER_PASSWORD = 'Wusho1467+';
const LOGO_URL = 'https://i.ibb.co/wF8KhQCN/sem-fundo.png';
const INSTITUTION_NAME = 'Instituto Ignis de Educação Digital';
const INSTITUTION_CONTACT = 'ead.institutoignis.com.br | contato@institutoignis.com.br';
const INSTITUTION_CNPJ = 'CNPJ: 56.967.489/0001-20';

function formatCpf(cpf: string | null): string {
  if (!cpf) return '___.___.___-__';
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return cpf;
  return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9)}`;
}

function formatDateExtended(dateStr: string | null): string {
  if (!dateStr) return formatDateExtended(addMonthsToDate(new Date().toISOString(), 6));
  const months = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];
  const d = new Date(dateStr);
  return `${d.getUTCDate()} de ${months[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

function addMonthsToDate(dateStr: string, months: number): string {
  const baseDate = new Date(dateStr);
  if (Number.isNaN(baseDate.getTime())) {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months, now.getUTCDate())).toISOString();
  }
  return new Date(
    Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + months, baseDate.getUTCDate())
  ).toISOString();
}

async function loadImageBytes(src: string): Promise<Uint8Array> {
  const res = await fetch(src);
  return new Uint8Array(await res.arrayBuffer());
}

async function loadPngBytesFromUrl(src: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        const base64 = dataUrl.split(',')[1];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        resolve(bytes);
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = reject;
    img.src = src;
  });
}

/** Draw a mixed bold/regular line. Segments alternate: regular, bold, regular, bold... */
function drawMixedText(
  page: PDFPage,
  segments: { text: string; bold: boolean }[],
  x: number,
  y: number,
  maxWidth: number,
  fontRegular: PDFFont,
  fontBold: PDFFont,
  fontSize: number,
  lineHeight: number,
  color = rgb(0.15, 0.15, 0.15),
): number {
  // Flatten segments into words with font info
  const wordItems: { word: string; font: PDFFont }[] = [];
  for (const seg of segments) {
    const font = seg.bold ? fontBold : fontRegular;
    const words = seg.text.split(' ').filter(w => w.length > 0);
    for (const w of words) {
      wordItems.push({ word: w, font });
    }
  }

  let currentY = y;
  let lineWords: { word: string; font: PDFFont }[] = [];
  let lineWidth = 0;
  const spaceWidth = fontRegular.widthOfTextAtSize(' ', fontSize);

  const flushLine = () => {
    let curX = x;
    for (let i = 0; i < lineWords.length; i++) {
      const item = lineWords[i];
      page.drawText(item.word, { x: curX, y: currentY, size: fontSize, font: item.font, color });
      curX += item.font.widthOfTextAtSize(item.word, fontSize);
      if (i < lineWords.length - 1) curX += spaceWidth;
    }
    currentY -= lineHeight;
    lineWords = [];
    lineWidth = 0;
  };

  for (const item of wordItems) {
    const wordW = item.font.widthOfTextAtSize(item.word, fontSize);
    const extraSpace = lineWords.length > 0 ? spaceWidth : 0;
    if (lineWidth + extraSpace + wordW > maxWidth && lineWords.length > 0) {
      flushLine();
    }
    if (lineWords.length > 0) lineWidth += spaceWidth;
    lineWidth += wordW;
    lineWords.push(item);
  }
  if (lineWords.length > 0) flushLine();

  return currentY;
}

function drawWrappedText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: PDFFont,
  fontSize: number,
  lineHeight: number,
  color = rgb(0.15, 0.15, 0.15)
): number {
  const words = text.split(' ');
  let line = '';
  let currentY = y;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    if (testWidth > maxWidth && line) {
      page.drawText(line, { x, y: currentY, size: fontSize, font, color });
      currentY -= lineHeight;
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) {
    page.drawText(line, { x, y: currentY, size: fontSize, font, color });
    currentY -= lineHeight;
  }
  return currentY;
}

async function createVerificationHash(data: DeclarationData): Promise<string> {
  const randomBytes = crypto.getRandomValues(new Uint8Array(12));
  const randomSeed = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const hashSource = `${data.enrollmentId}|${data.studentName}|${data.courseName}|${Date.now()}|${randomSeed}`;
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(hashSource));
  return Array.from(new Uint8Array(hashBuffer)).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function downloadPdf(bytes: Uint8Array, fileName: string) {
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export async function generateDeclarationPDF(data: DeclarationData): Promise<void> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

  const margin = 60;
  const contentWidth = width - margin * 2;
  // Navy blue ~ #060d47
  const navy = rgb(0.024, 0.051, 0.278);
  const darkText = rgb(0.15, 0.15, 0.15);
  const grayText = rgb(0.35, 0.35, 0.35);
  const declarationLogoUrl = data.logoUrl || LOGO_URL;

  const centerText = (text: string, font: PDFFont, size: number, yPos: number, color = grayText) => {
    const tw = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (width - tw) / 2, y: yPos, size, font, color });
  };

  // ===== WATERMARK (behind everything) =====
  try {
    const wmBytes = await loadPngBytesFromUrl(declarationLogoUrl);
    const wmImage = await pdfDoc.embedPng(wmBytes);
    const wmTargetW = 320;
    const wmScale = wmTargetW / wmImage.width;
    const wmH = wmImage.height * wmScale;
    page.drawImage(wmImage, {
      x: (width - wmTargetW) / 2,
      y: (height - wmH) / 2,
      width: wmTargetW,
      height: wmH,
      opacity: 0.07,
    });
  } catch (e) {
    console.warn('Could not load watermark', e);
  }

  // ===== HEADER WITH NAVY BACKGROUND =====
  const headerPadding = 24;
  const headerHeight = 110;
  const headerTopY = height;
  const headerBottomY = height - headerHeight;
  const white = rgb(1, 1, 1);

  // Draw navy background rectangle for header
  page.drawRectangle({
    x: 0,
    y: headerBottomY,
    width: width,
    height: headerHeight,
    color: navy,
  });

  let y = headerTopY - headerPadding;

  // Logo inside navy header (white on dark)
  try {
    const logoBytes = await loadPngBytesFromUrl(declarationLogoUrl);
    const logoImage = await pdfDoc.embedPng(logoBytes);
    const logoScale = 42 / logoImage.height;
    const logoW = logoImage.width * logoScale;
    page.drawImage(logoImage, {
      x: (width - logoW) / 2,
      y: y - 42,
      width: logoW,
      height: 42,
    });
  } catch (e) {
    console.warn('Could not load logo', e);
  }
  y -= 50;

  // Institution text in white
  const centerTextAt = (text: string, font: PDFFont, size: number, yPos: number, color: typeof white) => {
    const tw = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (width - tw) / 2, y: yPos, size, font, color });
  };

  centerTextAt(INSTITUTION_NAME, fontBold, 11, y, white);
  y -= 13;
  centerTextAt(INSTITUTION_CONTACT, fontRegular, 8.5, y, rgb(0.85, 0.88, 0.92));
  y -= 11;
  centerTextAt(INSTITUTION_CNPJ, fontRegular, 8.5, y, rgb(0.85, 0.88, 0.92));

  // Move below header with generous top margin (~60px)
  y = headerBottomY - 60;

  // Title
  const title = 'DECLARAÇÃO DE MATRÍCULA';
  const titleW = fontBold.widthOfTextAtSize(title, 17);
  page.drawText(title, { x: (width - titleW) / 2, y, size: 17, font: fontBold, color: navy });
  // Large gap below title (~40px)
  y -= 50;

  // ===== BODY TEXT — split into paragraphs at each period =====
  const resolvedConclusionDate = data.lastPaymentDueDate || addMonthsToDate(data.enrolledAt, 6);
  const conclusionDateStr = formatDateExtended(resolvedConclusionDate);
  const cpfFormatted = formatCpf(data.studentCpf);
  const enrollmentCode = data.enrollmentId.slice(0, 8).toUpperCase();
  const categoryText = data.courseCategory ? ` (${data.courseCategory})` : '';

  const bodyFontSize = 11.5;
  const bodyLineHeight = 20;
  const paragraphSpacing = 18; // generous gap between paragraphs

  // Paragraph 1
  const para1: { text: string; bold: boolean }[] = [
    { text: 'Declaramos, para os devidos fins, que o(a) aluno(a)', bold: false },
    { text: data.studentName + ',', bold: true },
    { text: 'portador(a) do CPF Nº', bold: false },
    { text: cpfFormatted + ',', bold: true },
    { text: 'encontra-se regularmente matriculado(a) no curso de', bold: false },
    { text: data.courseName + categoryText + ',', bold: true },
    { text: 'na modalidade', bold: false },
    { text: 'ENSINO À DISTÂNCIA (EAD),', bold: true },
    { text: 'sob a matrícula Nº', bold: false },
    { text: enrollmentCode + '.', bold: true },
  ];
  y = drawMixedText(page, para1, margin, y, contentWidth, fontRegular, fontBold, bodyFontSize, bodyLineHeight, darkText);
  y -= paragraphSpacing;

  // Paragraph 2
  const para2: { text: string; bold: boolean }[] = [
    { text: 'O curso possui uma carga horária total de', bold: false },
    { text: `${data.workloadHours} horas/aula`, bold: true },
    { text: 'e está previsto para ser concluído até', bold: false },
    { text: conclusionDateStr + '.', bold: true },
  ];
  y = drawMixedText(page, para2, margin, y, contentWidth, fontRegular, fontBold, bodyFontSize, bodyLineHeight, darkText);

  // Paragraph 3 — disclaimer
  y -= paragraphSpacing;

  const disclaimer = 'Declaramos, ainda, que esta declaração é emitida exclusivamente para fins de comprovação de estudos, não possuindo validade para utilização como comprovante de registro, inscrição ou qualquer outro tipo de documento perante Conselhos de Classe Profissionais.';
  y = drawWrappedText(page, disclaimer, margin, y, contentWidth, fontRegular, 10.5, 17, darkText);

  // ===== FOOTER SECTION — fixed at bottom =====

  // Electronic signature seal at very bottom
  const sealFontSize = 7.5;
  const sealLineHeight = 10.5;
  const sealPadding = 8;
  const sealInnerPadding = 6;
  const sealColor = rgb(0.30, 0.30, 0.30);
  const sealBorderColor = rgb(0.55, 0.58, 0.62);
  const sealBgColor = rgb(0.96, 0.97, 0.98);

  const now = new Date();
  const emissionDateTime = `${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  const verificationHash = await createVerificationHash(data);

  const sealLines = [
    `Documento assinado eletronicamente por ${INSTITUTION_NAME}.`,
    `Data e Hora da Emissão: ${emissionDateTime}`,
    `Código de Autenticidade: ${verificationHash}`,
    'Para verificar a autenticidade deste documento, entre em contato com a secretaria informando o código acima.',
  ];

  // Calculate seal height
  const sealTextLines = sealLines.reduce((count, line) => {
    const lineW = fontRegular.widthOfTextAtSize(line, sealFontSize);
    const sealMaxW = contentWidth - sealInnerPadding * 2;
    return count + Math.ceil(lineW / sealMaxW);
  }, 0);
  const sealBoxHeight = sealPadding * 2 + (sealTextLines + 1) * sealLineHeight + 6;
  const sealBottomY = 30;
  const sealBoxY = sealBottomY;
  const sealTopY = sealBoxY + sealBoxHeight;

  // Draw seal box
  page.drawRectangle({
    x: margin,
    y: sealBoxY,
    width: contentWidth,
    height: sealBoxHeight,
    color: sealBgColor,
    borderColor: sealBorderColor,
    borderWidth: 0.6,
  });

  page.drawText('ASSINATURA ELETRONICA', {
    x: margin + sealInnerPadding,
    y: sealTopY - sealPadding - 1,
    size: 7,
    font: fontBold,
    color: navy,
  });

  let sealTextY = sealTopY - sealPadding - sealLineHeight - 4;
  const sealMaxWidth = contentWidth - sealInnerPadding * 2;

  for (const sealLine of sealLines) {
    const words = sealLine.split(' ');
    let currentLine = '';
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (fontRegular.widthOfTextAtSize(testLine, sealFontSize) > sealMaxWidth && currentLine) {
        page.drawText(currentLine, { x: margin + sealInnerPadding, y: sealTextY, size: sealFontSize, font: fontRegular, color: sealColor });
        sealTextY -= sealLineHeight;
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      page.drawText(currentLine, { x: margin + sealInnerPadding, y: sealTextY, size: sealFontSize, font: fontRegular, color: sealColor });
      sealTextY -= sealLineHeight;
    }
  }

  // Location and date — above the seal with extra margin
  const months2 = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];
  const locationDate = `Barueri, São Paulo, ${now.getDate()} de ${months2[now.getMonth()]} de ${now.getFullYear()}.`;
  const locationY = sealTopY + 22; // extra margin to avoid overlap
  centerText(locationDate, fontRegular, 10, locationY, darkText);

  // Institution name — above location with spacing
  const signatureCenterX = width / 2;
  const instNameY = locationY + 16;
  page.drawText(INSTITUTION_NAME, {
    x: signatureCenterX - fontRegular.widthOfTextAtSize(INSTITUTION_NAME, 8) / 2,
    y: instNameY,
    size: 8,
    font: fontRegular,
    color: grayText,
  });

  // Signer name
  const signatureNameY = instNameY + 13;
  page.drawText('David Anderson Lira da Silva', {
    x: signatureCenterX - fontRegular.widthOfTextAtSize('David Anderson Lira da Silva', 8.5) / 2,
    y: signatureNameY,
    size: 8.5,
    font: fontRegular,
    color: grayText,
  });

  // Label
  const secLabelY = signatureNameY + 15;
  page.drawText('SECRETARIA ACADÊMICA', {
    x: signatureCenterX - fontBold.widthOfTextAtSize('SECRETARIA ACADÊMICA', 9.5) / 2,
    y: secLabelY,
    size: 9.5,
    font: fontBold,
    color: navy,
  });

  // Signature line
  const lineW = 200;
  const lineX = signatureCenterX - lineW / 2;
  const signatureLineY = secLabelY + 14;
  page.drawLine({
    start: { x: lineX, y: signatureLineY },
    end: { x: lineX + lineW, y: signatureLineY },
    thickness: 0.8,
    color: navy,
  });

  // Rubrica image above the line
  const sigImgHeight = 32;
  const sigImgBottomY = signatureLineY + 4;
  try {
    const sigBytes = await loadImageBytes(rubricaImg);
    const sigImage = await pdfDoc.embedPng(sigBytes);
    const sigScale = sigImgHeight / sigImage.height;
    const sigW = sigImage.width * sigScale;
    page.drawImage(sigImage, {
      x: signatureCenterX - sigW / 2,
      y: sigImgBottomY,
      width: sigW,
      height: sigImgHeight,
    });
  } catch (e) {
    console.warn('Could not load signature', e);
  }

  // Emission info — left aligned, between body and signature
  const emissionBlockY = sigImgBottomY + sigImgHeight + 14;
  const footerDividerY = emissionBlockY + 16;

  page.drawLine({
    start: { x: margin, y: footerDividerY },
    end: { x: width - margin, y: footerDividerY },
    thickness: 0.7,
    color: rgb(0.75, 0.78, 0.82),
  });

  const footerLines = [
    `Emitido em: ${emissionDateTime}`,
    'Validade: 30 dias',
    'Emissão/Assinatura: Digital',
  ];

  let footerY = footerDividerY - 14;
  for (const line of footerLines) {
    page.drawText(line, { x: margin, y: footerY, size: 8.6, font: fontRegular, color: grayText });
    footerY -= 13;
  }

  // ===== SAVE & ENCRYPT =====
  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
  const encryptedBytes = await encryptPDF(pdfBytes, '', {
    ownerPassword: OWNER_PASSWORD,
    allowPrinting: true,
    allowHighQualityPrint: true,
    allowCopying: true,
    allowModifying: false,
    allowAnnotating: false,
    allowAssembly: false,
    allowFillingForms: false,
  });

  downloadPdf(
    encryptedBytes,
    `declaracao_matricula_${data.studentName.replace(/\s+/g, '_')}.pdf`
  );
}
