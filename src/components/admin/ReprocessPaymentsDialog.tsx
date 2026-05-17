import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calendar, DollarSign, Hash } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ReprocessPaymentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (firstDueDate: string, customValue?: number, customInstallments?: number) => void;
  isLoading: boolean;
  studentName: string;
  courseName: string;
  courseId: string;
}

interface CoursePaymentInfo {
  installment_price: number | null;
  installment_count: number | null;
}

export function ReprocessPaymentsDialog({
  open,
  onOpenChange,
  onConfirm,
  isLoading,
  studentName,
  courseName,
  courseId,
}: ReprocessPaymentsDialogProps) {
  const [firstDueDate, setFirstDueDate] = useState(() => {
    // Default to next month, day 10
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 10);
    return nextMonth.toISOString().split('T')[0];
  });
  
  const [paymentType, setPaymentType] = useState<'configured' | 'custom'>('configured');
  const [customValue, setCustomValue] = useState<string>('');
  const [customInstallments, setCustomInstallments] = useState<string>('');
  const [coursePaymentInfo, setCoursePaymentInfo] = useState<CoursePaymentInfo | null>(null);
  const [loadingCourseInfo, setLoadingCourseInfo] = useState(false);

  // Fetch course payment info when dialog opens
  useEffect(() => {
    if (open && courseId) {
      setLoadingCourseInfo(true);
      supabase
        .from('courses')
        .select('installment_price, installment_count')
        .eq('id', courseId)
        .single()
        .then(({ data, error }) => {
          if (!error && data) {
            setCoursePaymentInfo(data);
            // Pre-fill custom fields with configured values
            if (data.installment_price) {
              setCustomValue(data.installment_price.toString());
            }
            if (data.installment_count) {
              setCustomInstallments(data.installment_count.toString());
            }
          }
          setLoadingCourseInfo(false);
        });
    }
  }, [open, courseId]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setPaymentType('configured');
      setCustomValue('');
      setCustomInstallments('');
      setCoursePaymentInfo(null);
    }
  }, [open]);

  const handleConfirm = () => {
    if (paymentType === 'custom') {
      const value = parseFloat(customValue);
      const installments = parseInt(customInstallments);
      
      if (isNaN(value) || value <= 0) {
        return;
      }
      if (isNaN(installments) || installments <= 0) {
        return;
      }
      
      onConfirm(firstDueDate, value, installments);
    } else {
      onConfirm(firstDueDate);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const hasConfiguredValues = coursePaymentInfo?.installment_price && coursePaymentInfo?.installment_count;

  const isCustomValid = paymentType === 'configured' || 
    (parseFloat(customValue) > 0 && parseInt(customInstallments) > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Recriar Boletos com Split
          </DialogTitle>
          <DialogDescription>
            Configure os boletos para <strong>{studentName}</strong> no curso <strong>{courseName}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Date field */}
          <div className="space-y-2">
            <Label htmlFor="firstDueDate">Data do 1º vencimento</Label>
            <Input
              id="firstDueDate"
              type="date"
              value={firstDueDate}
              onChange={(e) => setFirstDueDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
            />
            <p className="text-xs text-muted-foreground">
              Os demais boletos terão vencimento no mesmo dia dos meses seguintes.
            </p>
          </div>

          {/* Payment type selection */}
          <div className="space-y-3">
            <Label>Valor do Parcelamento</Label>
            
            {loadingCourseInfo ? (
              <div className="h-20 bg-muted animate-pulse rounded" />
            ) : (
              <RadioGroup
                value={paymentType}
                onValueChange={(value) => setPaymentType(value as 'configured' | 'custom')}
                className="space-y-3"
              >
                {/* Configured value option */}
                <div className="flex items-start space-x-3">
                  <RadioGroupItem 
                    value="configured" 
                    id="configured" 
                    disabled={!hasConfiguredValues}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <Label 
                      htmlFor="configured" 
                      className={`font-medium cursor-pointer ${!hasConfiguredValues ? 'text-muted-foreground' : ''}`}
                    >
                      Usar valor configurado no curso
                    </Label>
                    {hasConfiguredValues ? (
                      <div className="mt-1 p-3 bg-muted rounded-md">
                        <div className="flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-1.5">
                            <DollarSign className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{formatCurrency(coursePaymentInfo.installment_price!)}</span>
                            <span className="text-muted-foreground">/ mês</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Hash className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{coursePaymentInfo.installment_count}</span>
                            <span className="text-muted-foreground">parcelas</span>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Total: {formatCurrency(coursePaymentInfo.installment_price! * coursePaymentInfo.installment_count!)}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-destructive mt-1">
                        Este curso não tem valores de parcelamento configurados.
                      </p>
                    )}
                  </div>
                </div>

                {/* Custom value option */}
                <div className="flex items-start space-x-3">
                  <RadioGroupItem value="custom" id="custom" className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="custom" className="font-medium cursor-pointer">
                      Usar valor personalizado
                    </Label>
                    
                    {paymentType === 'custom' && (
                      <div className="mt-3 space-y-3">
                        <div className="space-y-2">
                          <Label htmlFor="customValue" className="text-sm text-muted-foreground">
                            Valor da mensalidade (R$)
                          </Label>
                          <div className="relative">
                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              id="customValue"
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0,00"
                              value={customValue}
                              onChange={(e) => setCustomValue(e.target.value)}
                              className="pl-9"
                            />
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="customInstallments" className="text-sm text-muted-foreground">
                            Quantidade de parcelas
                          </Label>
                          <div className="relative">
                            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              id="customInstallments"
                              type="number"
                              min="1"
                              max="48"
                              placeholder="12"
                              value={customInstallments}
                              onChange={(e) => setCustomInstallments(e.target.value)}
                              className="pl-9"
                            />
                          </div>
                        </div>

                        {parseFloat(customValue) > 0 && parseInt(customInstallments) > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Total: {formatCurrency(parseFloat(customValue) * parseInt(customInstallments))}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </RadioGroup>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancelar
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={isLoading || !firstDueDate || !isCustomValid || (paymentType === 'configured' && !hasConfiguredValues)}
          >
            {isLoading ? 'Processando...' : 'Confirmar e Recriar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
