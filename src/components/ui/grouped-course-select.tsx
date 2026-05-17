import * as React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Course {
  id: string;
  title: string;
  category: string | null;
}

interface GroupedCourseSelectProps {
  courses: Course[] | undefined;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  includeNoneOption?: boolean;
  noneOptionLabel?: string;
}

const CATEGORY_ORDER = ['EJA', 'Técnico', 'Competência', 'Profissional'];

export function GroupedCourseSelect({
  courses,
  value,
  onValueChange,
  placeholder = 'Selecione um curso',
  disabled = false,
  includeNoneOption = false,
  noneOptionLabel = 'Nenhum curso',
}: GroupedCourseSelectProps) {
  const [expandedCategories, setExpandedCategories] = React.useState<Set<string>>(new Set());

  // Reset expanded categories when dropdown opens
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setExpandedCategories(new Set());
    }
  };

  const toggleCategory = (category: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  // Group courses by category
  const groupedCourses = React.useMemo(() => {
    if (!courses) return [];

    const groups: Record<string, Course[]> = {};
    const uncategorized: Course[] = [];

    courses.forEach((course) => {
      if (course.category) {
        if (!groups[course.category]) {
          groups[course.category] = [];
        }
        groups[course.category].push(course);
      } else {
        uncategorized.push(course);
      }
    });

    // Sort groups by predefined order
    const sortedGroups = CATEGORY_ORDER
      .filter((cat) => groups[cat] && groups[cat].length > 0)
      .map((cat) => ({
        category: cat,
        courses: groups[cat].sort((a, b) => a.title.localeCompare(b.title)),
      }));

    // Add any categories not in the predefined order
    Object.keys(groups)
      .filter((cat) => !CATEGORY_ORDER.includes(cat))
      .forEach((cat) => {
        sortedGroups.push({
          category: cat,
          courses: groups[cat].sort((a, b) => a.title.localeCompare(b.title)),
        });
      });

    // Add uncategorized at the end if any
    if (uncategorized.length > 0) {
      sortedGroups.push({
        category: 'Outros',
        courses: uncategorized.sort((a, b) => a.title.localeCompare(b.title)),
      });
    }

    return sortedGroups;
  }, [courses]);

  return (
    <Select onValueChange={onValueChange} value={value} disabled={disabled} onOpenChange={handleOpenChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-[350px]">
        {includeNoneOption && (
          <SelectItem value="none">{noneOptionLabel}</SelectItem>
        )}
        {groupedCourses.map((group) => {
          const isExpanded = expandedCategories.has(group.category);
          return (
            <div key={group.category}>
              <div
                onClick={(e) => toggleCategory(group.category, e)}
                className="flex items-center gap-2 px-2 py-2 cursor-pointer hover:bg-accent rounded-sm transition-colors select-none"
              >
                <ChevronRight 
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform duration-200",
                    isExpanded && "rotate-90"
                  )} 
                />
                <Badge variant="outline" className="text-xs font-medium">
                  {group.category}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  ({group.courses.length} {group.courses.length === 1 ? 'curso' : 'cursos'})
                </span>
              </div>
              <div
                className={cn(
                  "overflow-hidden transition-all duration-200",
                  isExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
                )}
              >
                {group.courses.map((course) => (
                  <SelectItem key={course.id} value={course.id} className="pl-8">
                    {course.title}
                  </SelectItem>
                ))}
              </div>
            </div>
          );
        })}
      </SelectContent>
    </Select>
  );
}