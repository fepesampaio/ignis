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
  return (
    <Card className="card-elevated hover:shadow-lg transition-shadow">
      {variant === 'full' && thumbnailUrl && (
        <div className="aspect-video overflow-hidden rounded-t-lg">
          <img
            src={thumbnailUrl}
            alt={title}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <CardHeader>
        <div className="flex items-center justify-between">
          <Badge variant="secondary">{category || 'Curso'}</Badge>
          <span className="text-sm text-muted-foreground">
            {progress}{variant === 'full' ? '% concluído' : '%'}
          </span>
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription className="line-clamp-2">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={progress} className="h-2" />
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <BookOpen className="h-4 w-4" />
            <span>{completedLessons}/{lessonsCount} aulas</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <span>{workloadHours}h</span>
          </div>
        </div>
        <Button
          className="w-full"
          size={variant === 'compact' ? 'sm' : 'default'}
          onClick={() => onContinue(courseId)}
        >
          <PlayCircle className="h-4 w-4 mr-2" />
          {variant === 'compact' ? 'Continuar' : 'Continuar Curso'}
        </Button>
      </CardContent>
    </Card>
  );
}

export const EnrolledCourseCard = memo(EnrolledCourseCardComponent);
