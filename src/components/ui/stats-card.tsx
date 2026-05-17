import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: 'default' | 'primary' | 'secondary' | 'success' | 'warning';
  className?: string;
}

const variants = {
  default: 'bg-card',
  primary: 'bg-gradient-to-br from-primary to-primary/80',
  secondary: 'bg-gradient-to-br from-secondary to-secondary/80',
  success: 'bg-gradient-to-br from-success to-success/80',
  warning: 'bg-gradient-to-br from-warning to-warning/80',
};

const iconVariants = {
  default: 'bg-primary/10 text-primary',
  primary: 'bg-white/20 text-white',
  secondary: 'bg-white/20 text-white',
  success: 'bg-white/20 text-white',
  warning: 'bg-white/20 text-white',
};

const textVariants = {
  default: 'text-foreground',
  primary: 'text-white',
  secondary: 'text-white',
  success: 'text-white',
  warning: 'text-white',
};

export function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = 'default',
  className,
}: StatsCardProps) {
  return (
    <div
      className={cn(
        'card-stats relative overflow-hidden',
        variants[variant],
        variant !== 'default' && 'border-0',
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p
            className={cn(
              'text-sm font-medium',
              variant === 'default' ? 'text-muted-foreground' : 'text-white/80'
            )}
          >
            {title}
          </p>
          <p
            className={cn(
              'text-3xl font-bold font-display',
              textVariants[variant]
            )}
          >
            {value}
          </p>
          {subtitle && (
            <p
              className={cn(
                'text-sm',
                variant === 'default' ? 'text-muted-foreground' : 'text-white/70'
              )}
            >
              {subtitle}
            </p>
          )}
          {trend && (
            <div
              className={cn(
                'inline-flex items-center gap-1 text-sm font-medium',
                trend.isPositive ? 'text-success' : 'text-destructive',
                variant !== 'default' && 'text-white/90'
              )}
            >
              <span>{trend.isPositive ? '↑' : '↓'}</span>
              <span>{trend.value}%</span>
            </div>
          )}
        </div>
        <div
          className={cn(
            'p-3 rounded-xl',
            iconVariants[variant]
          )}
        >
          <Icon className="w-6 h-6" />
        </div>
      </div>

      {/* Decorative element */}
      {variant !== 'default' && (
        <div className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full bg-white/10" />
      )}
    </div>
  );
}
