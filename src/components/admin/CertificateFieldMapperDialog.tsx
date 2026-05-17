import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Move, Save, Eye, EyeOff, ChevronLeft, ChevronRight, AlertCircle, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Plus, Trash2, Copy, FileText } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Field instance - allows multiple instances of the same field type
export interface FieldInstance {
  id: string;
  fieldType: FieldType;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  maxWidth?: number;
  label?: string; // Optional custom label for this instance
}

// Available field types
export type FieldType = 
  | 'studentName'
  | 'courseName'
  | 'subjects'
  | 'startDate'
  | 'endDate'
  | 'issueDate'
  | 'workloadHours'
  | 'certificateNumber'
  | 'cpf';

// Page mapping with field instances
export interface PageFieldsMapping {
  fields: FieldInstance[];
}

// Multi-page mapping structure (new format with version 2)
export interface MultiPageCertificateMapping {
  version: 2;
  pages: Record<number, PageFieldsMapping>;
  totalPages: number;
}

// Legacy format for backwards compatibility
interface FieldPosition {
  x: number;
  y: number;
  fontSize: number;
  enabled: boolean;
  color: string;
  maxWidth?: number;
  page?: number;
}

export interface CertificateFieldsMapping {
  studentName: FieldPosition;
  courseName: FieldPosition;
  subjects: FieldPosition;
  startDate: FieldPosition;
  endDate: FieldPosition;
  issueDate: FieldPosition;
  workloadHours: FieldPosition;
  certificateNumber: FieldPosition;
  cpf: FieldPosition;
}

const fieldLabels: Record<FieldType, string> = {
  studentName: "Nome do Aluno",
  courseName: "Nome do Curso",
  subjects: "Matérias",
  startDate: "Data de Início",
  endDate: "Data de Término",
  issueDate: "Data de Emissão",
  workloadHours: "Carga Horária",
  certificateNumber: "Número do Certificado",
  cpf: "CPF do Aluno",
};

const sampleData: Record<FieldType, string> = {
  studentName: "João da Silva Santos",
  courseName: "Curso de Especialização em Gestão",
  subjects: "Matemática, Português, História, Geografia, Ciências",
  startDate: "01/01/2025",
  endDate: "31/12/2025",
  issueDate: "14/01/2026",
  workloadHours: "360 horas",
  certificateNumber: "CERT-2026-ABC123",
  cpf: "123.456.789-00",
};

// Sample subjects list for preview mode (with more subjects to test two-column layout)
const sampleSubjectsList = [
  "Matemática Aplicada",
  "Língua Portuguesa",
  "História do Brasil",
  "Geografia Econômica",
  "Ciências Naturais",
  "Física Moderna",
  "Química Orgânica",
  "Biologia Celular",
  "Filosofia da Educação",
  "Sociologia Contemporânea",
];

// Threshold for using two columns
const MAX_SUBJECTS_PER_COLUMN = 8;

const allFieldTypes: FieldType[] = [
  'studentName', 'courseName', 'subjects', 'startDate', 
  'endDate', 'issueDate', 'workloadHours', 'certificateNumber', 'cpf'
];

// Generate unique ID
const generateId = () => Math.random().toString(36).substring(2, 11);

// Create default field instance
const createFieldInstance = (fieldType: FieldType, yOffset: number = 0): FieldInstance => ({
  id: generateId(),
  fieldType,
  x: 50,
  y: 30 + yOffset,
  fontSize: fieldType === 'studentName' ? 24 : fieldType === 'courseName' ? 18 : 12,
  color: fieldType === 'certificateNumber' ? '#666666' : '#000000',
  maxWidth: ['studentName', 'courseName', 'subjects'].includes(fieldType) ? 80 : undefined,
});

// Convert legacy format to new format
const convertLegacyMapping = (legacy: unknown, numPages: number = 1): MultiPageCertificateMapping => {
  const pages: Record<number, PageFieldsMapping> = {};
  
  if (!legacy || typeof legacy !== 'object') {
    return { version: 2, pages: { 1: { fields: [] } }, totalPages: numPages };
  }
  
  // If it has pages property but no version, it's old multi-page format
  if ('pages' in legacy && !('version' in legacy)) {
    const oldFormat = legacy as { pages?: Record<number, CertificateFieldsMapping>, totalPages?: number };
    const oldPages = oldFormat.pages || {};
    const oldTotalPages = oldFormat.totalPages || numPages;
    
    Object.entries(oldPages).forEach(([pageNum, pageMapping]) => {
      const fields: FieldInstance[] = [];
      if (pageMapping && typeof pageMapping === 'object') {
        Object.entries(pageMapping).forEach(([key, field]) => {
          if (field && typeof field === 'object' && 'enabled' in field && (field as FieldPosition).enabled) {
            const fp = field as FieldPosition;
            fields.push({
              id: generateId(),
              fieldType: key as FieldType,
              x: fp.x,
              y: fp.y,
              fontSize: fp.fontSize,
              color: fp.color,
              maxWidth: fp.maxWidth,
            });
          }
        });
      }
      pages[Number(pageNum)] = { fields };
    });
    return { version: 2, pages, totalPages: oldTotalPages };
  }
  
  // Single page legacy format (has studentName directly)
  if ('studentName' in legacy) {
    const legacyMapping = legacy as CertificateFieldsMapping;
    const fields: FieldInstance[] = [];
    Object.entries(legacyMapping).forEach(([key, field]) => {
      if (field && typeof field === 'object' && 'enabled' in field && (field as FieldPosition).enabled) {
        const fp = field as FieldPosition;
        fields.push({
          id: generateId(),
          fieldType: key as FieldType,
          x: fp.x,
          y: fp.y,
          fontSize: fp.fontSize,
          color: fp.color,
          maxWidth: fp.maxWidth,
        });
      }
    });
    pages[1] = { fields };
    return { version: 2, pages, totalPages: numPages };
  }
  
  // Empty/default
  return { version: 2, pages: { 1: { fields: [] } }, totalPages: numPages };
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateUrl: string;
  currentMapping: CertificateFieldsMapping | MultiPageCertificateMapping | { pages: Record<number, CertificateFieldsMapping>; totalPages: number } | null;
  onSave: (mapping: MultiPageCertificateMapping) => void;
  saving?: boolean;
}

// Helper to check if mapping is new multi-page format (version 2)
const isNewMultiPageMapping = (mapping: unknown): mapping is MultiPageCertificateMapping => {
  return mapping !== null && typeof mapping === 'object' && 'version' in (mapping as object) && (mapping as MultiPageCertificateMapping).version === 2;
};

export function CertificateFieldMapperDialog({
  open,
  onOpenChange,
  templateUrl,
  currentMapping,
  onSave,
  saving,
}: Props) {
  // Multi-page mapping state with field instances
  const [pagesMapping, setPagesMapping] = useState<Record<number, PageFieldsMapping>>({});
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [previewMode, setPreviewMode] = useState(false); // Toggle between edit and preview mode
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragFieldId, setDragFieldId] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const isPdfTemplate = templateUrl.toLowerCase().endsWith('.pdf');

  // Get current page's fields
  const currentPageFields = pagesMapping[currentPage]?.fields || [];
  
  // Get selected field
  const selectedField = currentPageFields.find(f => f.id === selectedFieldId) || null;

  // Initialize mapping from props
  useEffect(() => {
    if (currentMapping) {
      if (isNewMultiPageMapping(currentMapping)) {
        setPagesMapping(currentMapping.pages);
        setTotalPages(currentMapping.totalPages);
      } else {
        // Legacy format - convert
        const converted = convertLegacyMapping(currentMapping, 1);
        setPagesMapping(converted.pages);
        setTotalPages(converted.totalPages);
      }
    } else {
      setPagesMapping({ 1: { fields: [] } });
    }
  }, [currentMapping, open]);

  // Load PDF using pdf.js when it's a PDF
  useEffect(() => {
    if (!open || !isPdfTemplate) return;
    
    setPdfLoaded(false);
    setPdfError(false);

    const loadPdf = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let pdfjsLib = (window as any).pdfjsLib;
        
        if (!pdfjsLib) {
          await new Promise<void>((resolve, reject) => {
            if (document.querySelector('script[data-pdfjs]')) {
              const checkLoaded = setInterval(() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if ((window as any).pdfjsLib) {
                  clearInterval(checkLoaded);
                  resolve();
                }
              }, 100);
              setTimeout(() => {
                clearInterval(checkLoaded);
                reject(new Error('Timeout loading PDF.js'));
              }, 10000);
              return;
            }

            const script = document.createElement('script');
            script.setAttribute('data-pdfjs', 'true');
            script.src = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js';
            script.onload = () => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const pdfjs = (window as any).pdfjsLib;
              if (pdfjs) {
                pdfjs.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
              }
              resolve();
            };
            script.onerror = () => reject(new Error('Failed to load PDF.js'));
            document.head.appendChild(script);
          });
          
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          pdfjsLib = (window as any).pdfjsLib;
        }
        
        if (!pdfjsLib) {
          throw new Error('PDF.js não foi carregado');
        }

        const loadingTask = pdfjsLib.getDocument(templateUrl);
        const pdf = await loadingTask.promise;
        
        setTotalPages(pdf.numPages);
        
        // Initialize pages if needed
        setPagesMapping(prev => {
          const updated = { ...prev };
          for (let i = 1; i <= pdf.numPages; i++) {
            if (!updated[i]) {
              updated[i] = { fields: [] };
            }
          }
          return updated;
        });
        
        const page = await pdf.getPage(currentPage);
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        const containerWidth = previewRef.current?.clientWidth || 800;
        const viewport = page.getViewport({ scale: 1 });
        const scale = containerWidth / viewport.width;
        const scaledViewport = page.getViewport({ scale });

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        await page.render({
          canvasContext: context,
          viewport: scaledViewport,
        }).promise;

        setPdfLoaded(true);
      } catch (error) {
        console.error('Error loading PDF:', error);
        setPdfError(true);
      }
    };

    loadPdf();
  }, [open, isPdfTemplate, templateUrl, currentPage]);

  // Update a field instance
  const updateFieldInstance = (fieldId: string, updates: Partial<FieldInstance>) => {
    setPagesMapping(prev => {
      const pageFields = prev[currentPage]?.fields || [];
      const updatedFields = pageFields.map(f => 
        f.id === fieldId ? { ...f, ...updates } : f
      );
      return {
        ...prev,
        [currentPage]: { fields: updatedFields },
      };
    });
  };

  // Add a new field instance
  const addFieldInstance = (fieldType: FieldType) => {
    const existingCount = currentPageFields.filter(f => f.fieldType === fieldType).length;
    const newField = createFieldInstance(fieldType, existingCount * 10);
    
    setPagesMapping(prev => {
      const pageFields = prev[currentPage]?.fields || [];
      return {
        ...prev,
        [currentPage]: { fields: [...pageFields, newField] },
      };
    });
    
    setSelectedFieldId(newField.id);
    toast.success(`Campo "${fieldLabels[fieldType]}" adicionado`);
  };

  // Remove a field instance
  const removeFieldInstance = (fieldId: string) => {
    const field = currentPageFields.find(f => f.id === fieldId);
    
    setPagesMapping(prev => {
      const pageFields = prev[currentPage]?.fields || [];
      return {
        ...prev,
        [currentPage]: { fields: pageFields.filter(f => f.id !== fieldId) },
      };
    });
    
    if (selectedFieldId === fieldId) {
      setSelectedFieldId(null);
    }
    
    if (field) {
      toast.success(`Campo "${fieldLabels[field.fieldType]}" removido`);
    }
  };

  // Duplicate a field instance
  const duplicateFieldInstance = (fieldId: string) => {
    const field = currentPageFields.find(f => f.id === fieldId);
    if (!field) return;
    
    const newField: FieldInstance = {
      ...field,
      id: generateId(),
      y: Math.min(100, field.y + 5),
      label: field.label ? `${field.label} (cópia)` : undefined,
    };
    
    setPagesMapping(prev => {
      const pageFields = prev[currentPage]?.fields || [];
      return {
        ...prev,
        [currentPage]: { fields: [...pageFields, newField] },
      };
    });
    
    setSelectedFieldId(newField.id);
    toast.success(`Campo duplicado`);
  };

  const handlePreviewClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!selectedFieldId || !previewRef.current || isDragging) return;

    const rect = previewRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    updateFieldInstance(selectedFieldId, { x: Math.round(x), y: Math.round(y) });
  };

  const handleDragStart = (e: React.MouseEvent, fieldId: string) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);
    setDragFieldId(fieldId);
    setSelectedFieldId(fieldId);
  };

  const handleDragMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !dragFieldId || !previewRef.current) return;

    const rect = previewRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    updateFieldInstance(dragFieldId, { x: Math.round(x), y: Math.round(y) });
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setDragFieldId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!selectedFieldId || !selectedField) return;

    const step = e.shiftKey ? 5 : 1;
    let newX = selectedField.x;
    let newY = selectedField.y;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        newY = Math.max(0, newY - step);
        break;
      case 'ArrowDown':
        e.preventDefault();
        newY = Math.min(100, newY + step);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        newX = Math.max(0, newX - step);
        break;
      case 'ArrowRight':
        e.preventDefault();
        newX = Math.min(100, newX + step);
        break;
      default:
        return;
    }

    updateFieldInstance(selectedFieldId, { x: newX, y: newY });
  };

  const nudgeField = (direction: 'up' | 'down' | 'left' | 'right', step: number = 1) => {
    if (!selectedFieldId || !selectedField) return;

    switch (direction) {
      case 'up':
        updateFieldInstance(selectedFieldId, { y: Math.max(0, selectedField.y - step) });
        break;
      case 'down':
        updateFieldInstance(selectedFieldId, { y: Math.min(100, selectedField.y + step) });
        break;
      case 'left':
        updateFieldInstance(selectedFieldId, { x: Math.max(0, selectedField.x - step) });
        break;
      case 'right':
        updateFieldInstance(selectedFieldId, { x: Math.min(100, selectedField.x + step) });
        break;
    }
  };

  const handleSave = () => {
    // Ensure all pages have mapping
    const completePages: Record<number, PageFieldsMapping> = {};
    for (let i = 1; i <= totalPages; i++) {
      completePages[i] = pagesMapping[i] || { fields: [] };
    }
    
    const multiPageMapping: MultiPageCertificateMapping = {
      version: 2,
      pages: completePages,
      totalPages,
    };
    onSave(multiPageMapping);
  };

  const renderPdfPreview = () => {
    if (pdfError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <AlertCircle className="w-12 h-12 text-destructive mb-4" />
          <p className="text-lg font-medium mb-2">Não foi possível carregar o PDF</p>
          <p className="text-sm text-muted-foreground mb-4">
            O navegador pode bloquear PDFs externos. Tente enviar o certificado como imagem (PNG ou JPG) para melhor compatibilidade.
          </p>
        </div>
      );
    }

    return (
      <>
        {!pdfLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full object-contain pointer-events-none"
          style={{ display: pdfLoaded ? 'block' : 'none' }}
        />
      </>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-6xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Mapear Campos do Certificado</DialogTitle>
          <DialogDescription>
            Adicione campos e arraste-os para posicioná-los. Você pode adicionar o mesmo campo várias vezes.
          </DialogDescription>
        </DialogHeader>

        {isPdfTemplate && (
          <Alert variant="default" className="bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800 dark:text-amber-200">
              Para melhor experiência de mapeamento, recomendamos enviar o certificado como imagem (PNG ou JPG) em vez de PDF.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[60vh]">
          {/* Preview Area */}
          <div className="lg:col-span-2 border rounded-lg overflow-hidden bg-gray-100 relative">
            <div className="absolute top-2 right-2 z-10 flex gap-2">
              {isPdfTemplate && totalPages > 1 && (
                <div className="flex items-center gap-1 bg-background rounded-md border">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm px-2">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
              <Button
                variant={previewMode ? "default" : "outline"}
                size="sm"
                onClick={() => setPreviewMode(!previewMode)}
                title="Ver como ficará o certificado final"
              >
                <FileText className="w-4 h-4 mr-1" />
                {previewMode ? "Voltar ao Mapeamento" : "Preview Final"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
              >
                {showPreview ? <EyeOff className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
                {showPreview ? "Ocultar" : "Mostrar"}
              </Button>
            </div>
            
            <div
              ref={previewRef}
              className={`relative w-full h-full flex items-center justify-center ${
                isDragging ? 'cursor-grabbing' : 'cursor-crosshair'
              }`}
              onClick={handlePreviewClick}
              onMouseMove={handleDragMove}
              onMouseUp={handleDragEnd}
              onMouseLeave={handleDragEnd}
              onKeyDown={handleKeyDown}
              tabIndex={0}
            >
              {isPdfTemplate ? (
                renderPdfPreview()
              ) : (
                <img
                  src={templateUrl}
                  alt="Certificate Template"
                  className="max-w-full max-h-full object-contain pointer-events-none"
                />
              )}

              {/* Field Markers - Edit Mode */}
              {showPreview && !previewMode && currentPageFields.map((field) => {
                const isSelected = selectedFieldId === field.id;
                const isBeingDragged = dragFieldId === field.id;

                return (
                  <div
                    key={field.id}
                    className={`absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-auto transition-all select-none ${
                      isBeingDragged ? 'cursor-grabbing scale-110 z-50' : 'cursor-grab'
                    } ${isSelected ? "ring-2 ring-primary ring-offset-2 z-40" : "z-10"}`}
                    style={{
                      left: `${field.x}%`,
                      top: `${field.y}%`,
                      fontSize: `${Math.max(8, field.fontSize * 0.6)}px`,
                      color: field.color,
                      maxWidth: field.maxWidth ? `${field.maxWidth}%` : "auto",
                      textAlign: "center",
                      backgroundColor: isBeingDragged 
                        ? "rgba(59, 130, 246, 0.9)" 
                        : isSelected 
                          ? "rgba(255,255,255,0.95)" 
                          : "rgba(255,255,255,0.8)",
                      padding: "4px 8px",
                      borderRadius: "6px",
                      whiteSpace: "nowrap",
                      boxShadow: isSelected ? "0 4px 12px rgba(0,0,0,0.15)" : "0 2px 4px rgba(0,0,0,0.1)",
                    }}
                    onMouseDown={(e) => handleDragStart(e, field.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFieldId(field.id);
                    }}
                  >
                    <Move className={`w-3 h-3 inline-block mr-1 ${isBeingDragged ? 'text-white' : 'opacity-50'}`} />
                    <span className={isBeingDragged ? 'text-white' : ''}>
                      {field.label || sampleData[field.fieldType]}
                    </span>
                  </div>
                );
              })}

              {/* Field Values - Preview Mode (simulates final PDF) */}
              {showPreview && previewMode && currentPageFields.map((field) => {
                // Special handling for subjects - render as grade/histórico
                // Use two columns for many subjects
                if (field.fieldType === 'subjects') {
                  const fontSize = Math.max(8, field.fontSize * 0.6);
                  const lineHeight = fontSize * 1.5;
                  const useTwoColumns = sampleSubjectsList.length > MAX_SUBJECTS_PER_COLUMN;
                  
                  if (useTwoColumns) {
                    const midPoint = Math.ceil(sampleSubjectsList.length / 2);
                    const leftColumn = sampleSubjectsList.slice(0, midPoint);
                    const rightColumn = sampleSubjectsList.slice(midPoint);
                    
                    return (
                      <div
                        key={field.id}
                        className="absolute pointer-events-none flex gap-8"
                        style={{
                          left: `${field.x}%`,
                          top: `${field.y}%`,
                          transform: 'translate(-50%, 0)',
                        }}
                      >
                        {/* Left column */}
                        <div>
                          {leftColumn.map((subject, index) => (
                            <div
                              key={index}
                              style={{
                                fontSize: `${fontSize}px`,
                                color: field.color,
                                lineHeight: `${lineHeight}px`,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {index + 1}. {subject}
                            </div>
                          ))}
                        </div>
                        {/* Right column */}
                        <div>
                          {rightColumn.map((subject, index) => (
                            <div
                              key={index}
                              style={{
                                fontSize: `${fontSize}px`,
                                color: field.color,
                                lineHeight: `${lineHeight}px`,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {midPoint + index + 1}. {subject}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  
                  // Single column layout
                  return (
                    <div
                      key={field.id}
                      className="absolute pointer-events-none"
                      style={{
                        left: `${field.x}%`,
                        top: `${field.y}%`,
                        transform: 'translate(-50%, 0)',
                      }}
                    >
                      {sampleSubjectsList.map((subject, index) => (
                        <div
                          key={index}
                          style={{
                            fontSize: `${fontSize}px`,
                            color: field.color,
                            lineHeight: `${lineHeight}px`,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {index + 1}. {subject}
                        </div>
                      ))}
                    </div>
                  );
                }

                return (
                  <div
                    key={field.id}
                    className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    style={{
                      left: `${field.x}%`,
                      top: `${field.y}%`,
                      fontSize: `${Math.max(8, field.fontSize * 0.6)}px`,
                      color: field.color,
                      maxWidth: field.maxWidth ? `${field.maxWidth}%` : "auto",
                      textAlign: "center",
                      whiteSpace: "nowrap",
                      fontWeight: ['studentName', 'courseName'].includes(field.fieldType) ? 'bold' : 'normal',
                    }}
                  >
                    {field.label || sampleData[field.fieldType]}
                  </div>
                );
              })}

              {selectedFieldId && !isDragging && !previewMode && (
                <div className="absolute bottom-2 left-2 bg-background/90 backdrop-blur-sm rounded-md px-3 py-2 text-xs text-muted-foreground border shadow-sm">
                  💡 Arraste o campo ou use as setas do teclado (Shift + seta = 5px)
                </div>
              )}

              {previewMode && (
                <div className="absolute bottom-2 left-2 bg-primary/90 backdrop-blur-sm rounded-md px-3 py-2 text-xs text-white border shadow-sm">
                  👁️ Modo Preview: visualizando como ficará no PDF final
                </div>
              )}
            </div>
          </div>

          {/* Fields Configuration */}
          <div className="border rounded-lg overflow-hidden">
            <ScrollArea className="h-full p-4">
              <div className="space-y-4">
                {/* Current page indicator */}
                {totalPages > 1 && (
                  <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                    <p className="text-sm font-medium text-primary">
                      📄 Página {currentPage} de {totalPages}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {currentPageFields.length} campo(s) nesta página
                    </p>
                  </div>
                )}

                {/* Add field dropdown */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Adicionar Campo</Label>
                  <Select onValueChange={(value) => addFieldInstance(value as FieldType)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um campo para adicionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {allFieldTypes.map(type => (
                        <SelectItem key={type} value={type}>
                          <span className="flex items-center gap-2">
                            <Plus className="w-3 h-3" />
                            {fieldLabels[type]}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="text-sm text-muted-foreground space-y-1">
                  <p>• Clique em um campo para selecioná-lo</p>
                  <p>• Arraste para posicionar</p>
                  <p>• Use setas do teclado para ajuste fino</p>
                </div>

                {/* Field instances list */}
                {currentPageFields.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">Nenhum campo adicionado</p>
                    <p className="text-xs mt-1">Use o seletor acima para adicionar campos</p>
                  </div>
                ) : (
                  currentPageFields.map((field) => {
                    const isSelected = selectedFieldId === field.id;

                    return (
                      <div
                        key={field.id}
                        className={`p-3 rounded-lg border transition-all cursor-pointer ${
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        }`}
                        onClick={() => setSelectedFieldId(field.id)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Label className="font-medium">{fieldLabels[field.fieldType]}</Label>
                            {currentPageFields.filter(f => f.fieldType === field.fieldType).length > 1 && (
                              <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                #{currentPageFields.filter(f => f.fieldType === field.fieldType).indexOf(field) + 1}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={(e) => { e.stopPropagation(); duplicateFieldInstance(field.id); }}
                              title="Duplicar"
                            >
                              <Copy className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={(e) => { e.stopPropagation(); removeFieldInstance(field.id); }}
                              title="Remover"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>

                        {isSelected && (
                          <div className="space-y-3 mt-3 pt-3 border-t">
                            {/* Custom label */}
                            <div>
                              <Label className="text-xs">Rótulo Personalizado (opcional)</Label>
                              <Input
                                type="text"
                                placeholder={sampleData[field.fieldType]}
                                value={field.label || ''}
                                onChange={(e) => updateFieldInstance(field.id, { label: e.target.value || undefined })}
                                className="h-8 mt-1"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>

                            {/* Nudge controls */}
                            <div>
                              <Label className="text-xs mb-2 block">Ajustar Posição</Label>
                              <div className="flex items-center justify-center gap-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                                  <div />
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={(e) => { e.stopPropagation(); nudgeField('up'); }}
                                  >
                                    <ArrowUp className="h-4 w-4" />
                                  </Button>
                                  <div />
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={(e) => { e.stopPropagation(); nudgeField('left'); }}
                                  >
                                    <ArrowLeft className="h-4 w-4" />
                                  </Button>
                                  <div className="h-8 w-8 flex items-center justify-center text-xs text-muted-foreground">
                                    1%
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={(e) => { e.stopPropagation(); nudgeField('right'); }}
                                  >
                                    <ArrowRight className="h-4 w-4" />
                                  </Button>
                                  <div />
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={(e) => { e.stopPropagation(); nudgeField('down'); }}
                                  >
                                    <ArrowDown className="h-4 w-4" />
                                  </Button>
                                  <div />
                                </div>
                              </div>
                            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs">X (%)</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={field.x}
                                  onChange={(e) => updateFieldInstance(field.id, { x: Number(e.target.value) })}
                                  className="h-8"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Y (%)</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={field.y}
                                  onChange={(e) => updateFieldInstance(field.id, { y: Number(e.target.value) })}
                                  className="h-8"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs">Tamanho da Fonte</Label>
                                <Input
                                  type="number"
                                  min={8}
                                  max={72}
                                  value={field.fontSize}
                                  onChange={(e) => updateFieldInstance(field.id, { fontSize: Number(e.target.value) })}
                                  className="h-8"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Cor</Label>
                                <Input
                                  type="color"
                                  value={field.color}
                                  onChange={(e) => updateFieldInstance(field.id, { color: e.target.value })}
                                  className="h-8 p-1"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                            </div>

                            {['studentName', 'courseName', 'subjects'].includes(field.fieldType) && (
                              <div>
                                <Label className="text-xs">Largura Máxima (%)</Label>
                                <Input
                                  type="number"
                                  min={10}
                                  max={100}
                                  value={field.maxWidth || 80}
                                  onChange={(e) => updateFieldInstance(field.id, { maxWidth: Number(e.target.value) })}
                                  className="h-8"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Salvar Mapeamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
