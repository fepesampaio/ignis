import { memo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { BookOpen, Clock, PlayCircle } from 'lucide-react';

export interface EnrolledCourseCardProps {
  enrollmentId: string;
  courseId: string;
  title?: string;
  description?: string | null;
  category?: string | null;
  thumbnailUrl?: string | null;
  workloadHours?: number | null;
  progress: number;
  completedLessons: number;
  lessonsCount: number;
  variant?: 'full' | 'compact';
  onContinue: (courseId: string) => void;
}

function EnrolledCourseCardComponent({
  courseId,
  title,
  description,
  category,
  thumbnailUrl,
  workloadHours,
  progress,
  completedLessons,
  lessonsCount,
  variant = 'full',
  onContinue,
}: EnrolledCourseCardProps) {
  const safeProgress = Number.isFinite(progress) ? Math.max(0, Math.round(progress)) : 0;
  const safeCompletedLessons = Number.isFinite(completedLessons) ? completedLessons : 0;
  const safeLessonsCount = Number.isFinite(lessonsCount) ? lessonsCount : 0;
  const safeWorkloadHours = Number.isFinite(workloadHours) ? workloadHours : 0;

  return (
    <Card className="card-elevated hover:shadow-lg transition-shadow">
      {variant === 'full' && thumbnailUrl && (
        <div className="aspect-video overflow-hidden rounded-t-lg">
          <img
            src={thumbnailUrl}
            alt={title}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </div>
      )}

      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <Badge variant="secondary">{category || 'Curso'}</Badge>
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {safeProgress}{variant === 'full' ? '% concluído' : '%'}
          </span>
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription className="line-clamp-2">{description}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <Progress value={safeProgress} className="h-2" />

        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <div className="flex min-w-0 items-center gap-1">
            <BookOpen className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{safeCompletedLessons}/{safeLessonsCount} aulas</span>
          </div>
          <div className="flex items-center gap-1 whitespace-nowrap">
            <Clock className="h-4 w-4 flex-shrink-0" />
            <span>{safeWorkloadHours}h</span>
          </div>
        </div>

        <Button
          className="w-full"
          size={variant === 'compact' ? 'sm' : 'default'}
          onClick={() => onContinue(courseId)}
        >
          <PlayCircle className="mr-2 h-4 w-4" />
          {variant === 'compact' ? 'Continuar' : 'Continuar Curso'}
        </Button>
      </CardContent>
    </Card>
  );
}

export const EnrolledCourseCard = memo(EnrolledCourseCardComponent);
