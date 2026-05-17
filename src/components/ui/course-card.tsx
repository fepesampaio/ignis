import { Clock, Users, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';

interface CourseCardProps {
  id: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  workloadHours: number;
  category?: string;
  progress?: number;
  enrolledCount?: number;
  lessonsCount?: number;
  onEnroll?: () => void;
  onContinue?: () => void;
  isEnrolled?: boolean;
  className?: string;
}

export function CourseCard({
  id,
  title,
  description,
  thumbnailUrl,
  workloadHours,
  category,
  progress,
  enrolledCount,
  lessonsCount,
  onEnroll,
  onContinue,
  isEnrolled,
  className,
}: CourseCardProps) {
  return (
    <div className={cn('card-course group', className)}>
      {/* Thumbnail */}
      <div className="relative h-40 overflow-hidden">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full bg-gradient-hero flex items-center justify-center">
            <BookOpen className="w-12 h-12 text-white/80" />
          </div>
        )}
        {category && (
          <span className="absolute top-3 left-3 badge-primary backdrop-blur-sm bg-primary/80 text-primary-foreground border-0">
            {category}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-5 space-y-4">
        <div>
          <h3 className="font-display font-semibold text-lg text-foreground line-clamp-2 group-hover:text-primary transition-colors">
            {title}
          </h3>
          {description && (
            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
              {description}
            </p>
          )}
        </div>

        {/* Meta Info */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4" />
            <span>{workloadHours}h</span>
          </div>
          {lessonsCount !== undefined && (
            <div className="flex items-center gap-1.5">
              <BookOpen className="w-4 h-4" />
              <span>{lessonsCount} aulas</span>
            </div>
          )}
          {enrolledCount !== undefined && (
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              <span>{enrolledCount}</span>
            </div>
          )}
        </div>

        {/* Progress */}
        {isEnrolled && progress !== undefined && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Progresso</span>
              <span className="font-medium text-foreground">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {/* Actions */}
        <div className="pt-2">
          {isEnrolled ? (
            <Button onClick={onContinue} className="w-full btn-animate">
              {progress === 100 ? 'Ver Certificado' : 'Continuar'}
            </Button>
          ) : (
            <Button onClick={onEnroll} variant="outline" className="w-full btn-animate">
              Matricular-se
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
