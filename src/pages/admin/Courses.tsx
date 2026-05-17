import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useBasePath } from '@/hooks/useBasePath';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { CourseFormDialog } from '@/components/admin/CourseFormDialog';
import { DeleteCourseDialog } from '@/components/admin/DeleteCourseDialog';
import { CopyCourseContentDialog } from '@/components/admin/CopyCourseContentDialog';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { useDebounce } from '@/hooks/useDebounce';

const PAGE_SIZE = 5;
import { 
  BookOpen, 
  Clock, 
  Users, 
  Plus, 
  Search,
  Edit,
  Trash2,
  Layers,
  GraduationCap,
  Briefcase,
  Award,
  FolderOpen,
  X,
  Copy
} from 'lucide-react';

interface Course {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  workload_hours: number;
  is_active: boolean;
  thumbnail_url: string | null;
  welcome_video_url: string | null;
  installment_price: number | null;
  installment_count: number | null;
  created_at: string;
  lessons: { count: number }[];
  enrollments: { count: number }[];
}

export default function AdminCourses() {
  const navigate = useNavigate();
  const { basePath } = useBasePath();
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  const { data: courses, isLoading } = useQuery({
    queryKey: ['admin-courses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('courses')
        .select(`
          *,
          lessons:lessons(count),
          enrollments:enrollments(count)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Course[];
    },
  });

  // Extrair categorias únicas dos cursos
  const categories = courses?.reduce((acc, course) => {
    if (course.category && !acc.find(c => c.name === course.category)) {
      acc.push({
        name: course.category,
        count: courses.filter(c => c.category === course.category).length
      });
    }
    return acc;
  }, [] as { name: string; count: number }[]) || [];

  // Ícone por categoria
  const getCategoryIcon = (category: string) => {
    const cat = category.toLowerCase();
    if (cat.includes('eja') || cat.includes('técnico') || cat.includes('tecnico')) {
      return GraduationCap;
    }
    if (cat.includes('competência') || cat.includes('competencia')) {
      return Award;
    }
    if (cat.includes('profissional')) {
      return Briefcase;
    }
    return FolderOpen;
  };

  // Cor por categoria
  const getCategoryColor = (category: string) => {
    const cat = category.toLowerCase();
    if (cat.includes('eja') || cat.includes('técnico') || cat.includes('tecnico')) {
      return 'bg-blue-500/10 text-blue-600 border-blue-200 hover:bg-blue-500/20';
    }
    if (cat.includes('competência') || cat.includes('competencia')) {
      return 'bg-amber-500/10 text-amber-600 border-amber-200 hover:bg-amber-500/20';
    }
    if (cat.includes('profissional')) {
      return 'bg-emerald-500/10 text-emerald-600 border-emerald-200 hover:bg-emerald-500/20';
    }
    return 'bg-purple-500/10 text-purple-600 border-purple-200 hover:bg-purple-500/20';
  };

  const filteredCourses = useMemo(() => {
    const term = debouncedSearch.toLowerCase();
    return courses?.filter(course => {
      const matchesSearch = course.title.toLowerCase().includes(term) ||
        course.category?.toLowerCase().includes(term);
      const matchesCategory = !selectedCategory || course.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [courses, debouncedSearch, selectedCategory]);

  const total = filteredCourses?.length || 0;
  const paginatedCourses = useMemo(
    () => filteredCourses?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredCourses, page]
  );

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, selectedCategory]);

  const handleNewCourse = () => {
    setSelectedCourse(null);
    setFormDialogOpen(true);
  };

  const handleEditCourse = (course: Course) => {
    setSelectedCourse(course);
    setFormDialogOpen(true);
  };

  const handleDeleteCourse = (course: Course) => {
    setSelectedCourse(course);
    setDeleteDialogOpen(true);
  };

  const handleCopyCourse = (course: Course) => {
    setSelectedCourse(course);
    setCopyDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">
              Gerenciar Cursos
            </h1>
            <p className="text-muted-foreground">
              Crie, edite e gerencie todos os cursos da plataforma
            </p>
          </div>
          <Button className="gap-2" onClick={handleNewCourse}>
            <Plus className="w-4 h-4" />
            Novo Curso
          </Button>
        </div>

        {/* Category Cards */}
        {categories.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">Filtrar por categoria</h2>
            <div className="flex flex-wrap gap-3">
              {categories.map((category) => {
                const Icon = getCategoryIcon(category.name);
                const isSelected = selectedCategory === category.name;
                return (
                  <button
                    key={category.name}
                    onClick={() => setSelectedCategory(isSelected ? null : category.name)}
                    className={`
                      flex items-center gap-3 px-4 py-3 rounded-xl border transition-all
                      ${isSelected 
                        ? 'ring-2 ring-primary ring-offset-2 ' + getCategoryColor(category.name)
                        : getCategoryColor(category.name)
                      }
                    `}
                  >
                    <Icon className="w-5 h-5" />
                    <div className="text-left">
                      <p className="font-medium text-sm">{category.name}</p>
                      <p className="text-xs opacity-70">{category.count} curso{category.count !== 1 ? 's' : ''}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Search and Active Filter */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar cursos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          {selectedCategory && (
            <Badge 
              variant="secondary" 
              className="gap-1 cursor-pointer hover:bg-secondary/80"
              onClick={() => setSelectedCategory(null)}
            >
              {selectedCategory}
              <X className="w-3 h-3" />
            </Badge>
          )}
        </div>

        {/* Courses Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="h-32 bg-muted" />
                <CardContent className="space-y-3 pt-4">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {paginatedCourses?.map((course) => (
              <Card key={course.id} className="group hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <BookOpen className="w-6 h-6 text-primary" />
                    </div>
                    <Badge variant={course.is_active ? "default" : "secondary"}>
                      {course.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg mt-3">{course.title}</CardTitle>
                  {course.category && (
                    <Badge variant="outline" className="w-fit">
                      {course.category}
                    </Badge>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {course.description || 'Sem descrição'}
                  </p>
                  
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      <span>{course.workload_hours}h</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <BookOpen className="w-4 h-4" />
                      <span>{course.lessons?.[0]?.count || 0} aulas</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      <span>{course.enrollments?.[0]?.count || 0}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="flex-1 gap-1"
                      onClick={() => navigate(`${basePath}/courses/${course.id}/subjects`)}
                    >
                      <Layers className="w-4 h-4" />
                      Matérias
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="flex-1 gap-1"
                      onClick={() => handleEditCourse(course)}
                    >
                      <Edit className="w-4 h-4" />
                      Editar
                    </Button>
                    {isAdmin && (
                      <>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleCopyCourse(course)}
                          title="Copiar curso"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDeleteCourse(course)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!isLoading && total > 0 && (
          <Card>
            <AdminPagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPageChange={setPage}
            />
          </Card>
        )}

        {filteredCourses?.length === 0 && !isLoading && (
          <Card className="p-12 text-center">
            <BookOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nenhum curso encontrado</h3>
            <p className="text-muted-foreground mt-1">
              {searchTerm ? 'Tente buscar com outros termos' : 'Comece criando seu primeiro curso'}
            </p>
          </Card>
        )}
      </div>

      {/* Dialogs */}
      <CourseFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        course={selectedCourse}
      />

      <DeleteCourseDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        course={selectedCourse}
      />

      <CopyCourseContentDialog
        open={copyDialogOpen}
        onOpenChange={setCopyDialogOpen}
        sourceCourseId={selectedCourse?.id || ""}
        sourceCourseTitle={selectedCourse?.title || ""}
      />
    </DashboardLayout>
  );
}
