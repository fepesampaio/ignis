import jsPDF from 'jspdf';
import { supabase } from '@/integrations/supabase/client';
import rubricaImg from '@/assets/rubrica.png';

interface TranscriptData {
  studentName: string;
  studentEmail: string;
  studentCpf: string | null;
  courseName: string;
  courseCategory: string | null;
  courseWorkloadHours: number;
  enrolledAt: string;
  subjects: {
    title: string;
    workloadHours: number;
    score: number | null;
    situation: 'Aprovado' | 'Reprovado' | 'Cursando';
  }[];
}

export async function generateTranscriptPDF(
  userId: string,
  courseId: string,
  enrollmentId: string
): Promise<void> {
  const [profileRes, courseRes, subjectsRes] = await Promise.all([
    supabase.from('profiles').select('full_name, email, cpf').eq('user_id', userId).single(),
    supabase.from('courses').select('title, category, workload_hours').eq('id', courseId).single(),
    supabase.from('subjects').select('id, title, order_index').eq('course_id', courseId).eq('is_active', true).eq('is_certificate_instructions', false).order('order_index'),
  ]);

  if (profileRes.error || courseRes.error || subjectsRes.error) {
    throw new Error('Erro ao buscar dados do aluno');
  }

  const profile = profileRes.data;
  const course = courseRes.data;
  const subjects = subjectsRes.data || [];

  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('enrolled_at')
    .eq('id', enrollmentId)
    .single();

  const subjectIds = subjects.map(s => s.id);
  const assignmentMap = new Map<string, { score: number | null; graded: boolean }>();

  if (subjectIds.length > 0) {
    const { data: assignments } = await supabase
      .from('assignments')
      .select('id, subject_id')
      .eq('course_id', courseId)
      .in('subject_id', subjectIds);

    if (assignments && assignments.length > 0) {
      const assignmentIds = assignments.map(a => a.id);
      const { data: submissions } = await supabase
        .from('assignment_submissions')
        .select('assignment_id, score, graded_at')
        .eq('user_id', userId)
        .in('assignment_id', assignmentIds);

      for (const assignment of assignments) {
        const submission = submissions?.find(s => s.assignment_id === assignment.id);
        if (submission) {
          assignmentMap.set(assignment.subject_id!, {
            score: submission.score,
            graded: !!submission.graded_at,
          });
        }
      }
    }
  }

  const hoursPerSubject = subjects.length > 0
    ? Math.round(course.workload_hours / subjects.length)
    : 0;

  const transcriptSubjects = subjects.map(s => {
    const sub = assignmentMap.get(s.id);
    let situation: 'Aprovado' | 'Reprovado' | 'Cursando' = 'Cursando';
    let score: number | null = null;

    if (sub && sub.graded && sub.score !== null) {
      score = sub.score;
      situation = sub.score >= 60 ? 'Aprovado' : 'Reprovado';
    }

    return { title: s.title, workloadHours: hoursPerSubject, score, situation };
  });

  const data: TranscriptData = {
    studentName: profile.full_name,
    studentEmail: profile.email,
    studentCpf: profile.cpf,
    courseName: course.title,
    courseCategory: course.category,
    courseWorkloadHours: course.workload_hours,
    enrolledAt: enrollment?.enrolled_at || '',
    subjects: transcriptSubjects,
  };

  // Load images before building PDF
  const logoUrl = 'https://i.ibb.co/wF8KhQCN/sem-fundo.png';
  const [sigBase64, logoBase64] = await Promise.all([
    loadImageAsBase64(rubricaImg),
    loadImageAsBase64(logoUrl).catch(() => ''),
  ]);
  buildPDF(data, sigBase64, logoBase64);
}

function loadImageAsBase64(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = src;
  });
}

function buildPDF(data: TranscriptData, signatureBase64: string, logoBase64: string) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = 210;
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = 0;

  // Colors
  const primaryColor: [number, number, number] = [30, 58, 95];
  const headerBg: [number, number, number] = [30, 58, 95];
  const lightBg: [number, number, number] = [245, 247, 250];
  const borderColor: [number, number, number] = [200, 210, 220];

  // ===== HEADER =====
  doc.setFillColor(...headerBg);
  doc.rect(0, 0, pageWidth, 36, 'F');

  // Logo
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', margin, 2, 18, 18);
    } catch (e) {
      console.warn('Could not add logo', e);
    }
  }

  const textCenterX = logoBase64 ? (margin + 20 + (pageWidth - margin - 20)) / 2 : pageWidth / 2;

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('INSTITUTO IGNIS DE EDUCAÇÃO DIGITAL', textCenterX, 10, { align: 'center' });

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('CNPJ: 56.967.489/0001-20 | contato@institutoignis.com.br | ead.institutoignis.com.br', textCenterX, 17, { align: 'center' });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('HISTÓRICO ESCOLAR', textCenterX, 28, { align: 'center' });

  y = 40;

  // ===== STUDENT DATA =====
  doc.setFillColor(...lightBg);
  doc.roundedRect(margin, y, contentWidth, 30, 2, 2, 'F');
  doc.setDrawColor(...borderColor);
  doc.roundedRect(margin, y, contentWidth, 30, 2, 2, 'S');

  doc.setTextColor(...primaryColor);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('DADOS DO ALUNO', margin + 4, y + 6);

  doc.setTextColor(60, 60, 60);
  doc.setFontSize(7.5);

  const col1 = margin + 4;
  const col2 = margin + contentWidth / 2 + 4;

  const labelVal = (label: string, value: string, x: number, yy: number) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, x, yy);
    const lw = doc.getTextWidth(label);
    doc.setFont('helvetica', 'normal');
    doc.text(value, x + lw + 1, yy);
  };

  labelVal('Nome:', data.studentName, col1, y + 12);
  labelVal('CPF:', data.studentCpf || '-', col2, y + 12);
  
  const courseLabel = data.courseCategory
    ? `${data.courseName} (${data.courseCategory})`
    : data.courseName;
  labelVal('Curso:', courseLabel, col1, y + 18);
  labelVal('Carga Horária:', `${data.courseWorkloadHours}h`, col2, y + 18);

  labelVal('E-mail:', data.studentEmail, col1, y + 24);
  labelVal('Matrícula:', formatDateBR(data.enrolledAt), col2, y + 24);

  y += 35;

  // ===== PERFORMANCE TABLE =====
  doc.setTextColor(...primaryColor);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('QUADRO DE DESEMPENHO', margin + 4, y);
  y += 3;

  const colWidths = [contentWidth * 0.50, contentWidth * 0.18, contentWidth * 0.15, contentWidth * 0.17];
  const headers = ['Disciplina', 'Carga Horária', 'Nota Final', 'Situação'];
  const rowHeight = 6;

  // Table header
  doc.setFillColor(...headerBg);
  doc.rect(margin, y, contentWidth, rowHeight, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');

  let xPos = margin;
  headers.forEach((header, i) => {
    doc.text(header, xPos + 2, y + 4.2);
    xPos += colWidths[i];
  });

  y += rowHeight;

  // Table rows
  doc.setFontSize(7);
  data.subjects.forEach((subject, index) => {
    const isEven = index % 2 === 0;
    if (isEven) {
      doc.setFillColor(...lightBg);
      doc.rect(margin, y, contentWidth, rowHeight, 'F');
    }

    doc.setDrawColor(...borderColor);
    doc.line(margin, y + rowHeight, margin + contentWidth, y + rowHeight);

    doc.setTextColor(50, 50, 50);
    doc.setFont('helvetica', 'normal');

    xPos = margin;

    const maxTitleWidth = colWidths[0] - 4;
    let title = subject.title;
    while (doc.getTextWidth(title) > maxTitleWidth && title.length > 3) {
      title = title.slice(0, -4) + '...';
    }
    doc.text(title, xPos + 2, y + 4.2);
    xPos += colWidths[0];

    doc.text(`${subject.workloadHours}h`, xPos + 2, y + 4.2);
    xPos += colWidths[1];

    doc.text(subject.score !== null ? String(subject.score) : '-', xPos + 2, y + 4.2);
    xPos += colWidths[2];

    if (subject.situation === 'Aprovado') {
      doc.setTextColor(22, 163, 74);
    } else if (subject.situation === 'Reprovado') {
      doc.setTextColor(220, 38, 38);
    } else {
      doc.setTextColor(202, 138, 4);
    }
    doc.setFont('helvetica', 'bold');
    doc.text(subject.situation, xPos + 2, y + 4.2);

    y += rowHeight;
  });

  // Table border
  doc.setDrawColor(...borderColor);
  const tableStartY = y - (data.subjects.length * rowHeight) - rowHeight;
  doc.rect(margin, tableStartY, contentWidth, y - tableStartY, 'S');

  y += 8;

  // ===== FOOTER =====
  // Emission date
  doc.setTextColor(80, 80, 80);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  const today = new Date();
  const emissionDate = `Documento emitido em ${today.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })}`;
  doc.text(emissionDate, pageWidth / 2, y, { align: 'center' });

  y += 6;

  // Signature image
  const sigWidth = 50;
  const sigHeight = 18;
  const sigX = (pageWidth - sigWidth) / 2;
  try {
    doc.addImage(signatureBase64, 'PNG', sigX, y, sigWidth, sigHeight);
  } catch (e) {
    console.warn('Could not add signature image', e);
  }
  y += sigHeight;

  // Signature line
  doc.setDrawColor(...primaryColor);
  doc.setLineWidth(0.4);
  const lineWidth = 70;
  const lineX = (pageWidth - lineWidth) / 2;
  doc.line(lineX, y, lineX + lineWidth, y);

  y += 4;
  doc.setTextColor(...primaryColor);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('David Anderson Lira da Silva', pageWidth / 2, y, { align: 'center' });
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Coordenação Pedagógica', pageWidth / 2, y, { align: 'center' });
  doc.text('Instituto Ignis de Educação Digital', pageWidth / 2, y + 4, { align: 'center' });

  // Save
  const fileName = `historico_${data.studentName.replace(/\s+/g, '_')}.pdf`;
  doc.save(fileName);
}

function formatDateBR(dateString: string): string {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
  } catch {
    return '-';
  }
}
