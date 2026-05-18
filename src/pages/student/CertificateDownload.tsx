import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, Download, Loader2, Award } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

// Types for multi-page certificate mapping (matching the mapper dialog)
type FieldType = 
  | 'studentName'
  | 'courseName'
  | 'subjects'
  | 'startDate'
  | 'endDate'
  | 'issueDate'
  | 'workloadHours'
  | 'certificateNumber'
  | 'cpf';

interface FieldInstance {
  id: string;
  fieldType: FieldType;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  maxWidth?: number;
  label?: string;
}

interface MultiPageCertificateMapping {
  version: 2;
  pages: Record<number, { fields: FieldInstance[] }>;
  totalPages: number;
}

export default function CertificateDownload() {
  const { certificateId } = useParams<{ certificateId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Fetch certificate with course and enrollment data
  const { data: certificate, isLoading } = useQuery({
    queryKey: ['certificate-download', certificateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('certificates')
        .select(`
          *,
          courses (
            id,
            title,
            workload_hours,
            category
          )
        `)
        .eq('id', certificateId)
        .eq('user_id', user?.id)
        .single();

      if (error) throw error;

      // Get user profile with CPF
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, cpf')
        .eq('user_id', user?.id)
        .single();

      // Get enrollment dates
      const { data: enrollment } = await supabase
        .from('enrollments')
        .select('enrolled_at, completed_at')
        .eq('user_id', user?.id)
        .eq('course_id', data.course_id)
        .single();

      // Get course subjects
      const { data: subjects } = await supabase
        .from('subjects')
        .select('title')
        .eq('course_id', data.course_id)
        .eq('is_active', true)
        .order('order_index');

      return { 
        ...data, 
        student_name: profile?.full_name,
        cpf: profile?.cpf,
        enrolled_at: enrollment?.enrolled_at,
        completed_at: enrollment?.completed_at,
        subjects: subjects?.map(s => s.title) || []
      };
    },
    enabled: !!certificateId && !!user?.id,
  });

  // Fetch certificate mapping
  const { data: mappingData } = useQuery({
    queryKey: ['certificate-mapping'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'certificate_fields_mapping')
        .maybeSingle();

      if (error) {
        console.error('Error fetching mapping:', error);
        return null;
      }
      
      let value = data?.value;
      if (typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch {
          console.error('Failed to parse mapping JSON');
          return null;
        }
      }
      return value as unknown as MultiPageCertificateMapping | null;
    },
  });

  // Fetch template URL
  const { data: templateUrl } = useQuery({
    queryKey: ['certificate-template'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'certificate_template_url')
        .maybeSingle();

      if (error) {
        console.error('Error fetching template URL:', error);
        return null;
      }
      
      let value = data?.value;
      if (typeof value === 'string') {
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        return value;
      }
      return null;
    },
  });

  const getFieldValue = (fieldType: FieldType): string => {
    if (!certificate) return '';
    
    switch (fieldType) {
      case 'studentName':
        return certificate.student_name || '';
      case 'courseName':
        return certificate.courses?.title || '';
      case 'subjects':
        return certificate.subjects?.join(', ') || '';
      case 'startDate':
        return certificate.enrolled_at 
          ? format(new Date(certificate.enrolled_at), "dd/MM/yyyy", { locale: ptBR })
          : '';
      case 'endDate':
        return certificate.completed_at 
          ? format(new Date(certificate.completed_at), "dd/MM/yyyy", { locale: ptBR })
          : format(new Date(certificate.issued_at), "dd/MM/yyyy", { locale: ptBR });
      case 'issueDate':
        return format(new Date(certificate.issued_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
      case 'workloadHours':
        return `${certificate.courses?.workload_hours || 0} horas`;
      case 'certificateNumber':
        return certificate.certificate_number;
      case 'cpf':
        return certificate.cpf || '';
      default:
        return '';
    }
  };

  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
      return {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255,
      };
    }
    return { r: 0, g: 0, b: 0 };
  };

  const handleDownloadPdf = async () => {
    if (!certificate) return;

    setIsGeneratingPdf(true);
    
    try {
      if (templateUrl && mappingData && mappingData.version === 2) {
        await generateMappedPdf();
      } else {
        toast.error('Template de certificado não configurado. Entre em contato com o administrador.');
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Erro ao gerar PDF. Tente novamente.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const generateMappedPdf = async () => {
    if (!templateUrl || !mappingData || !certificate) return;
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

    // Fetch the PDF template
    const templateResponse = await fetch(templateUrl);
    if (!templateResponse.ok) {
      throw new Error('Failed to fetch template');
    }
    const templateBytes = await templateResponse.arrayBuffer();

    // Load the existing PDF
    const pdfDoc = await PDFDocument.load(templateBytes);
    const pages = pdfDoc.getPages();
    
    // Embed font
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Process each page in the mapping
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const pageNumber = pageIndex + 1;
      const page = pages[pageIndex];
      const { width, height } = page.getSize();

      const pageData = mappingData.pages[pageNumber];
      if (!pageData || !pageData.fields) continue;

      for (const field of pageData.fields) {
        const fontSize = field.fontSize * 0.75;
        
        // The preview uses CSS transform: translate(-50%, -50%) which centers the text on the point
        // In PDF, text is drawn from bottom-left corner, so we need to adjust:
        // - For X: we need to estimate text width and subtract half (approximation)
        // - For Y: convert from top-down percentage to bottom-up, then adjust for centering
        
        // Get the text value to estimate width
        const textValue = field.fieldType === 'subjects' ? '' : getFieldValue(field.fieldType);
        const estimatedTextWidth = textValue.length * fontSize * 0.5; // rough approximation
        
        // X: percentage of width, then shift left by half the text width to center
        const x = (field.x / 100) * width - (estimatedTextWidth / 2);
        
        // Y: convert from top percentage to PDF coordinates (bottom-up)
        // The preview centers vertically with translate(-50%, -50%), so the point is the center
        // In PDF we draw from baseline, so we need to add half the font height
        const y = height - ((field.y / 100) * height) + (fontSize / 2);

        // Parse color
        const color = hexToRgb(field.color || '#000000');

        // Special handling for subjects - render as grade/histórico with each subject on its own line
        // For many subjects, use two columns side by side
        if (field.fieldType === 'subjects' && certificate.subjects && certificate.subjects.length > 0) {
          const subjects = certificate.subjects as string[];
          const subjectFontSize = field.fontSize * 0.75;
          const lineHeight = subjectFontSize * 1.5;
          
          // For subjects, the preview uses translate(-50%, 0) - only centers horizontally
          // Y starts from the top of the first line
          const subjectsY = height - ((field.y / 100) * height);
          
          // Determine if we need two columns (more than 8 subjects)
          const maxSubjectsPerColumn = 8;
          const useTwoColumns = subjects.length > maxSubjectsPerColumn;
          
          if (useTwoColumns) {
            // Split subjects into two columns
            const midPoint = Math.ceil(subjects.length / 2);
            const leftColumn = subjects.slice(0, midPoint);
            const rightColumn = subjects.slice(midPoint);
            const columnGap = (field.maxWidth ? (field.maxWidth / 100) * width : width * 0.4) / 2 + 20;
            
            // Draw left column
            leftColumn.forEach((subject, index) => {
              const text = `${index + 1}. ${subject}`;
              const yOffset = subjectsY - (index * lineHeight);
              
              page.drawText(text, {
                x,
                y: yOffset,
                size: subjectFontSize,
                font: font,
                color: rgb(color.r, color.g, color.b),
              });
            });
            
            // Draw right column
            rightColumn.forEach((subject, index) => {
              const globalIndex = midPoint + index;
              const text = `${globalIndex + 1}. ${subject}`;
              const yOffset = subjectsY - (index * lineHeight);
              
              page.drawText(text, {
                x: x + columnGap,
                y: yOffset,
                size: subjectFontSize,
                font: font,
                color: rgb(color.r, color.g, color.b),
              });
            });
          } else {
            // Single column for fewer subjects
            subjects.forEach((subject, index) => {
              const text = `${index + 1}. ${subject}`;
              const yOffset = subjectsY - (index * lineHeight);
              
              page.drawText(text, {
                x,
                y: yOffset,
                size: subjectFontSize,
                font: font,
                color: rgb(color.r, color.g, color.b),
                maxWidth: field.maxWidth ? (field.maxWidth / 100) * width : undefined,
              });
            });
          }
          continue;
        }

        const value = getFieldValue(field.fieldType);
        if (!value) continue;

        // Use bold font for names
        const useFont = field.fieldType === 'studentName' || field.fieldType === 'courseName' 
          ? fontBold 
          : font;

        // Draw text
        page.drawText(value, {
          x,
          y,
          size: fontSize,
          font: useFont,
          color: rgb(color.r, color.g, color.b),
          maxWidth: field.maxWidth ? (field.maxWidth / 100) * width : undefined,
        });
      }
    }

    // Save and download
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `certificado_${certificate.certificate_number}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast.success('Certificado baixado com sucesso!');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-8">
        <Card className="max-w-md mx-auto">
          <CardContent className="p-6 sm:p-8">
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!certificate) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="py-12 text-center">
            <h2 className="text-xl font-medium mb-4">Certificado não encontrado</h2>
            <Button onClick={() => navigate('/student/certificates')}>
              Voltar para Certificados
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted p-4 md:p-8 flex items-center justify-center">
      <Card className="max-w-md w-full">
        <CardContent className="p-6 sm:p-8 text-center space-y-6">
          <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
            <Award className="w-8 h-8 text-primary" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-xl font-bold">Certificado Disponível</h1>
            <p className="text-muted-foreground text-sm">
              {certificate.courses?.title}
            </p>
            <p className="text-xs text-muted-foreground">
              Nº {certificate.certificate_number}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <Button 
              size="lg" 
              onClick={handleDownloadPdf} 
              disabled={isGeneratingPdf}
              className="w-full"
            >
              {isGeneratingPdf ? (
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              ) : (
                <Download className="h-5 w-5 mr-2" />
              )}
              Baixar Certificado
            </Button>
            
            <Button 
              variant="ghost" 
              onClick={() => navigate('/student/certificates')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
